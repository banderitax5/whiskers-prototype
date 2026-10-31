// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
}))
vi.mock('../lib/api', () => ({
  apiGet: vi.fn(),
  apiGetAuth: vi.fn(),
  apiPostAuth: vi.fn(),
  apiPatchAuth: vi.fn(),
  apiDeleteAuth: vi.fn(),
  apiUploadAuth: vi.fn(),
  apiFetchAuth: vi.fn(),
}))
vi.mock('../lib/siteContent.js', () => ({
  fetchSiteContent: vi.fn(async () => null),
  contentSettings: () => ({ low_stock_threshold: 10 }),
}))
vi.mock('../context/RoleContext', () => ({ useRole: () => 'admin' }))

import AdminProductManagement from './AdminProductManagement.jsx'
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth, apiUploadAuth } from '../lib/api'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const PRODUCTS = [
  {
    prod_id: '11111111-1111-1111-1111-111111111111',
    prod_name: 'Dog Toy', category: 'TOYS', brand: 'HappyPaws', price: 150,
    stock_quantity: 10, is_active: true, image_url: null, description: null,
    details: null, archived_at: null, cost_price: 50, supplier: null,
  },
  {
    prod_id: '22222222-2222-2222-2222-222222222222',
    prod_name: 'Cat Toy', category: 'TOYS', brand: null, price: 0,
    stock_quantity: 0, is_active: true, image_url: null, description: null,
    details: null, archived_at: null, cost_price: null, supplier: null,
  },
]

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<AdminProductManagement />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

function mockBackend() {
  apiGetAuth.mockImplementation(async (path) => {
    if (String(path).startsWith('/admin/settings')) return { settings: { margin_warning_percent: 20 } }
    return { items: PRODUCTS, total: PRODUCTS.length }
  })
  apiGet.mockResolvedValue({ items: ['CATS', 'DOGS', 'TOYS'] })
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AdminProductManagement self-service upgrades', () => {
  it('renders rows with a Copy action, Export and Import buttons', async () => {
    mockBackend()
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/Dog Toy/)
    expect(c.textContent).toMatch(/Cat Toy/)
    const buttons = [...c.querySelectorAll('button')]
    expect(buttons.some((b) => b.textContent.includes('Export CSV'))).toBe(true)
    expect(buttons.some((b) => b.textContent.includes('Import CSV'))).toBe(true)
    expect(buttons.some((b) => b.getAttribute('aria-label') === 'More actions')).toBe(true)
  })

  it('offers a category dropdown with existing options instead of free text', async () => {
    mockBackend()
    const c = await render()
    await flush()
    await act(async () => {
      ;[...c.querySelectorAll('button')].find((b) => b.textContent.includes('New Product')).click()
    })
    const trigger = c.querySelector('#product-category-desktop')
    expect(trigger.tagName).toBe('BUTTON')
    // options render in a portal on document.body
    await act(async () => { trigger.click() })
    const labels = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)
    expect(labels).toContain('DOGS')
    expect(labels).toContain('TOYS')
    expect(labels).toContain('+ New category...')
    // choosing New flips to a free-text input for the new name
    await act(async () => {
      const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.getAttribute('data-value') === '__new__')
      opt.click()
    })
    const input = c.querySelector('#product-category-desktop')
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('placeholder')).toMatch(/New category name/)
  })

  it('warns inline when the price is 0 but still allows saving', async () => {
    mockBackend()
    const c = await render()
    await flush()
    await act(async () => {
      ;[...c.querySelectorAll('button')].find((b) => b.textContent.includes('New Product')).click()
    })
    const price = c.querySelector('input[aria-label="Price"]')
    expect(c.textContent).not.toMatch(/cannot buy/)
    await act(async () => setInputValue(price, '0'))
    expect(c.textContent).toMatch(/cannot buy/)
    await act(async () => setInputValue(price, '99'))
    expect(c.textContent).not.toMatch(/cannot buy/)
  })

  it('duplicates a product as Hidden with a "(copy)" name', async () => {
    mockBackend()
    apiPostAuth.mockResolvedValue({
      item: { ...PRODUCTS[0], prod_id: '33333333-3333-3333-3333-333333333333', prod_name: 'Dog Toy (copy)', is_active: false },
    })
    const c = await render()
    await flush()
    await act(async () => {
      // rows sort by name asc, so Cat Toy is first; open Dog Toy's three-dot menu
      const menuBtns = [...c.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === 'More actions')
      const dogMenu = menuBtns.find((b) => b.closest('tr')?.textContent.includes('Dog Toy'))
      expect(dogMenu).toBeTruthy()
      dogMenu.click()
    })
    await act(async () => {
      const dup = [...c.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.includes('Duplicate'))
      expect(dup).toBeTruthy()
      dup.click()
    })
    await flush()
    expect(apiPostAuth).toHaveBeenCalledTimes(1)
    const [path, body] = apiPostAuth.mock.calls[0]
    expect(path).toBe('/admin/products')
    expect(body.prod_name).toBe('Dog Toy (copy)')
    expect(body.is_active).toBe(false)
    expect(body.price).toBe(150)
  })

  it('bulk-applies Hide to every selected product', async () => {
    mockBackend()
    apiPatchAuth.mockResolvedValue({ item: {} })
    const c = await render()
    await flush()
    const allLabel = [...c.querySelectorAll('label')].find((l) => /Select all/.test(l.textContent))
    expect(allLabel).toBeTruthy()
    await act(async () => { allLabel.querySelector('input').click() })
    expect(c.textContent).toContain('2 selected')
    await act(async () => {
      ;[...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hide').click()
    })
    await flush()
    expect(apiPatchAuth.mock.calls.map((a) => a[0])).toEqual([
      '/admin/products/22222222-2222-2222-2222-222222222222',
      '/admin/products/11111111-1111-1111-1111-111111111111',
    ])
    apiPatchAuth.mock.calls.forEach(([, body]) => expect(body).toEqual({ is_active: false }))
  })

  it('lets the owner add extra product-information sections', async () => {
    mockBackend()
    const c = await render()
    await flush()
    await act(async () => {
      ;[...c.querySelectorAll('button')].find((b) => b.textContent.includes('New Product')).click()
    })
    const addBtn = [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Add section'))
    expect(addBtn).toBeTruthy()
    // five curated sections by default
    const textareas = () => [...c.querySelectorAll('textarea[aria-label$="content"]')]
    expect(textareas().length).toBe(5)
    await act(async () => { addBtn.click() })
    expect(textareas().length).toBe(6)
    // the new section's heading is editable
    const heading = c.querySelector('input[aria-label="Section 6 heading"]')
    expect(heading).toBeTruthy()
    await act(async () => setInputValue(heading, 'Expiry Date'))
    expect(heading.value).toBe('Expiry Date')
  })

  it('opens the CSV import dialog with a preview before saving', async () => {
    mockBackend()
    const c = await render()
    await flush()
    await act(async () => {
      ;[...c.querySelectorAll('button')].find((b) => b.textContent.includes('Import CSV')).click()
    })
    expect(c.textContent).toMatch(/Required columns/)
    expect(c.textContent).toMatch(/Download template/)
    const input = c.querySelector('input[type="file"]')
    const file = new File(
      ['prod_name,category,price,stock_quantity\r\nBird Swing,BIRDS,80,5\r\n'],
      'products.csv',
      { type: 'text/csv' },
    )
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(c.textContent).toMatch(/1 product ready/)
    expect(c.textContent).toMatch(/Bird Swing/)
  })

  it('rejects oversized or wrong-type images inline before uploading', async () => {
    mockBackend()
    const c = await render()
    await flush()
    await act(async () => {
      ;[...c.querySelectorAll('button')].find((b) => b.textContent.includes('New Product')).click()
    })
    // static hint sits under the dropzone
    expect(c.textContent).toMatch(/JPG, PNG, WebP or GIF/)
    expect(c.textContent).toMatch(/up to 5 MB/)
    const alerts = () => [...c.querySelectorAll('[role="alert"]')].map((a) => a.textContent)

    const input = c.querySelector('#product-image-desktop')
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
    Object.defineProperty(input, 'files', { value: [big], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(alerts().some((t) => /6\.0 MB/.test(t) && /limit is 5 MB/.test(t))).toBe(true)
    expect(apiUploadAuth).not.toHaveBeenCalled()

    const txt = new File(['x'], 'notes.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', { value: [txt], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(alerts().some((t) => /supported image/.test(t))).toBe(true)
    expect(apiUploadAuth).not.toHaveBeenCalled()
  })

  it('filters the list down to products with no image', async () => {
    const withImage = {
      ...PRODUCTS[0],
      prod_id: '33333333-3333-3333-3333-333333333333',
      prod_name: 'Photo Product',
      image_url: 'https://cdn.example.com/photo.jpg',
    }
    const noImage = { ...PRODUCTS[0], prod_id: '44444444-4444-4444-4444-444444444444', prod_name: 'Bare Product', image_url: null }
    const rows = [withImage, noImage]
    apiGetAuth.mockImplementation(async () => ({ items: rows, total: rows.length }))
    apiGet.mockResolvedValue({ items: ['TOYS'] })

    const c = await render()
    await flush()
    const chip = () => [...c.querySelectorAll('button')].find((b) => /No Image/.test(b.textContent))
    expect(chip().textContent).toMatch(/No Image \(1\)/)
    expect(c.textContent).toContain('Photo Product')

    await act(async () => { chip().click() })
    expect(chip().getAttribute('aria-pressed')).toBe('true')
    expect(c.textContent).toContain('Bare Product')
    expect(c.textContent).not.toContain('Photo Product')

    // the empty-state escape hatch turns the filter back off
    await act(async () => { chip().click() })
    expect(chip().getAttribute('aria-pressed')).toBe('false')
    expect(c.textContent).toContain('Photo Product')
  })
})
