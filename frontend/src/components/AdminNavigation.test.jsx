// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
}))
vi.mock('../lib/api', () => ({
  apiGetAuth: vi.fn(),
  apiPostAuth: vi.fn(),
  apiPatchAuth: vi.fn(),
  apiDeleteAuth: vi.fn(),
}))

import AdminNavigation from './AdminNavigation.jsx'
import { apiGetAuth, apiPostAuth } from '../lib/api'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<AdminNavigation />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

// sets a controlled input the way React sees it (prototype setter bypasses
// the instance value tracker, so the input event really reaches onChange)
function type(el, value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

const link = { id: 'n1', section: 'navbar', label: 'About us', href: '/about', image_url: null, alt_text: '', sort_order: 0, is_visible: true, archived_at: null }

const cats = {
  items: [
    { name: 'Birds', label: null, sort_order: null, is_visible: true, has_override: false },
    { name: 'Cats', label: 'Felines', sort_order: 0, is_visible: true, has_override: true },
  ],
  total: 2,
}

describe('AdminNavigation link tabs', () => {
  it('shows an empty state guiding the first link', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/No links in this section yet/i)
    expect(button(c, 'New link')).toBeTruthy()
  })

  it('lists a link with label, href and visibility pill', async () => {
    apiGetAuth.mockResolvedValue({ items: [link], total: 1 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/About us/)
    expect(c.textContent).toMatch(/\/about/)
    expect(c.textContent).toMatch(/Visible/)
  })

  it('shows an error with retry and never claims the list is empty', async () => {
    apiGetAuth.mockRejectedValueOnce(new Error('nope'))
    const c = await render()
    await flush()
    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/nope/)
    expect(button(c, 'Retry')).toBeTruthy()
    expect(c.textContent).not.toMatch(/No links in this section yet/i)
  })

  it('new-link dialog rejects a link that is not a site path or https URL', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'New link').click() })
    await flush()
    const form = c.querySelector('form')
    await act(async () => {
      type(c.querySelector('#nav-label'), 'Evil')
      type(c.querySelector('#nav-href'), 'javascript:alert(1)')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/Start the link with/)
    expect(apiPostAuth).not.toHaveBeenCalled()
  })
})

describe('AdminNavigation categories tab', () => {
  it('loads the merged list and keeps Save disabled until something changes', async () => {
    apiGetAuth.mockImplementation(async (path) => {
      if (path === '/admin/categories') return cats
      return { items: [], total: 0 }
    })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'Categories').click() })
    await flush()
    expect(apiGetAuth).toHaveBeenCalledWith('/admin/categories', 'test')
    expect(c.textContent).toMatch(/2 categories from your active products/)
    expect(c.querySelector('#cat-label-0')).toBeTruthy()
    const save = button(c, 'Save changes')
    expect(save.disabled).toBe(true)
  })

  it('marks dirty on edit and batch-saves with sequential sort orders', async () => {
    apiGetAuth.mockImplementation(async (path) => {
      if (path === '/admin/categories') return cats
      return { items: [], total: 0 }
    })
    apiPostAuth.mockResolvedValue({ success: true, count: 2 })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'Categories').click() })
    await flush()
    await act(async () => {
      type(c.querySelector('#cat-label-0'), 'Birdies')
    })
    const save = button(c, 'Save changes')
    expect(save.disabled).toBe(false)
    await act(async () => { save.click() })
    await flush()
    expect(apiPostAuth).toHaveBeenCalledTimes(1)
    const [path, body] = apiPostAuth.mock.calls[0]
    expect(path).toBe('/admin/categories')
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toEqual({ name: 'Birds', label: 'Birdies', sort_order: 0, is_visible: true })
    expect(body.items[1].sort_order).toBe(1)
    // label equal to the raw name collapses back to "no override"
    expect(body.items[1].label).toBe('Felines')
  })
})
