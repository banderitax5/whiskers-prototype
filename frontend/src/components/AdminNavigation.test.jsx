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
}))

import AdminNavigation from './AdminNavigation.jsx'
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth } from '../lib/api'

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

// AdminSelect renders its options in a portal on document.body; the trigger
// is a button, so picking = click trigger, then click the option button
function portalOptions() {
  return [...document.querySelectorAll('[role="option"]')]
}
async function pickSelect(id, value) {
  const trigger = document.querySelector(`#${id}`)
  await act(async () => { trigger.click() })
  const opt = portalOptions().find((o) => o.getAttribute('data-value') === value)
  if (!opt) throw new Error(`no portal option ${value} for #${id}`)
  await act(async () => { opt.click() })
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
    apiGet.mockResolvedValue({ items: [] })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'New link').click() })
    await flush()
    const form = c.querySelector('form')
    await act(async () => {
      type(c.querySelector('#nav-label'), 'Evil')
    })
    await pickSelect('nav-dest', 'custom')
    await act(async () => {
      type(c.querySelector('#nav-href'), 'javascript:alert(1)')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/Start the link with/)
    expect(apiPostAuth).not.toHaveBeenCalled()
  })

  it('composes the href from the page picker without asking for paths', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    apiGet.mockResolvedValue({ items: [] })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'New link').click() })
    await flush()
    const form = c.querySelector('form')
    await act(async () => {
      type(c.querySelector('#nav-label'), 'Shop')
    })
    await pickSelect('nav-page', '/menu')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()
    expect(apiPostAuth).toHaveBeenCalledTimes(1)
    const [path, body] = apiPostAuth.mock.calls[0]
    expect(path).toBe('/admin/nav-items')
    expect(body.label).toBe('Shop')
    expect(body.href).toBe('/menu')
  })

  it('composes a category filter link from the category picker', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    apiGet.mockResolvedValue({ items: ['Dogs', 'Birds'] })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'New link').click() })
    await flush()
    const form = c.querySelector('form')
    await pickSelect('nav-dest', 'category')
    await act(async () => {
      type(c.querySelector('#nav-label'), 'Dogs only')
    })
    await pickSelect('nav-category', 'Dogs')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()
    expect(apiPostAuth).toHaveBeenCalledTimes(1)
    expect(apiPostAuth.mock.calls[0][1].href).toBe('/menu?category=Dogs')
  })

  it('editing an existing link opens it in the matching picker', async () => {
    apiGetAuth.mockResolvedValue({ items: [link], total: 1 })
    apiGet.mockResolvedValue({ items: [] })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'Edit').click() })
    await flush()
    expect(c.querySelector('#nav-dest').textContent).toMatch(/A page on this site/)
    expect(c.querySelector('#nav-page').textContent).toMatch(/About us/)
  })

  it('bulk hide: select-all then one PATCH per link', async () => {
    const second = { ...link, id: 'n2', label: 'Menu', href: '/menu', sort_order: 1 }
    apiGetAuth.mockResolvedValue({ items: [link, second], total: 2 })
    apiPatchAuth.mockResolvedValue({ item: {} })
    const c = await render()
    await flush()

    const allLabel = [...c.querySelectorAll('label')].find((l) => /Select all/.test(l.textContent))
    expect(allLabel).toBeTruthy()
    await act(async () => { allLabel.querySelector('input').click() })
    expect(c.textContent).toContain('2 selected')

    const hideBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Hide 2')
    expect(hideBtn).toBeTruthy()
    await act(async () => { hideBtn.click() })
    await flush()

    expect(apiPatchAuth.mock.calls.map((a) => [a[0], a[1]])).toEqual([
      ['/admin/nav-items/n1', { is_visible: false }],
      ['/admin/nav-items/n2', { is_visible: false }],
    ])
    expect(c.textContent).toMatch(/Hidden 2 links/)
    expect(c.textContent).not.toContain('2 selected')
  })

  it('archived view lists each link once, in the restore list', async () => {
    const archivedLink = { ...link, archived_at: '2026-10-10T00:00:00Z' }
    apiGetAuth.mockResolvedValue({ items: [archivedLink], total: 1 })
    const c = await render()
    await flush()

    const showArchived = [...c.querySelectorAll('label')].find((l) => /Show archived/.test(l.textContent))
    await act(async () => { showArchived.querySelector('input').click() })
    await flush()

    // the restore list owns archived links - not a second copy as reorder cards
    expect((c.textContent.match(/About us/g) || []).length).toBe(1)
    expect([...c.querySelectorAll('button')].filter((b) => b.textContent === 'Restore')).toHaveLength(1)
    expect(c.querySelector('[data-sort-index]')).toBeNull()
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
    expect(c.textContent).toMatch(/2 categories/)
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

  it('drag-reorders category rows locally and marks the batch dirty', async () => {
    apiGetAuth.mockImplementation(async (path) => {
      if (path === '/admin/categories') return cats
      return { items: [], total: 0 }
    })
    apiPostAuth.mockResolvedValue({ success: true, count: 2 })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'Categories').click() })
    await flush()
    expect(button(c, 'Save changes').disabled).toBe(true)

    // jsdom has no layout, so a downward move resolves to the last slot
    const grip = c.querySelector('[data-sort-index="0"] [data-drag-handle]')
    await act(async () => {
      grip.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))
    })
    await act(async () => {
      window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 5, clientY: 400 }))
    })
    await act(async () => { window.dispatchEvent(new window.MouseEvent('pointerup')) })
    await flush()

    expect(button(c, 'Save changes').disabled).toBe(false)
    await act(async () => { button(c, 'Save changes').click() })
    await flush()
    const [, body] = apiPostAuth.mock.calls[0]
    expect(body.items.map((i) => i.name)).toEqual(['Cats', 'Birds'])
    expect(body.items.map((i) => i.sort_order)).toEqual([0, 1])
  })

  it('adds a category that has no products yet and batch-saves it', async () => {
    apiGetAuth.mockImplementation(async (path) => {
      if (path === '/admin/categories') return cats
      return { items: [], total: 0 }
    })
    apiPostAuth.mockResolvedValue({ success: true, count: 3, removed: 0 })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'Categories').click() })
    await flush()
    await act(async () => { button(c, '+ Add category').click() })
    await flush()
    await act(async () => { type(c.querySelector('#cat-new'), 'Reptiles') })
    await act(async () => { button(c, 'Add').click() })
    await flush()
    expect(c.textContent).toMatch(/No products yet/)
    expect(c.textContent).toMatch(/3 categories \(1 waiting for a product\)/)
    const save = button(c, 'Save changes')
    expect(save.disabled).toBe(false)
    await act(async () => { save.click() })
    await flush()
    expect(apiPostAuth).toHaveBeenCalledTimes(1)
    const [path, body] = apiPostAuth.mock.calls[0]
    expect(path).toBe('/admin/categories')
    expect(body.items.map((i) => i.name)).toEqual(['Birds', 'Cats', 'Reptiles'])
    expect(body.items[2]).toEqual({ name: 'Reptiles', label: null, sort_order: 2, is_visible: true })
    expect(body.removed).toBeUndefined()
  })

  it('removing a saved waiting category sends it along for server removal', async () => {
    const orphanCats = {
      items: [
        { name: 'Birds', label: null, sort_order: null, is_visible: true, has_override: false, in_catalog: true },
        { name: 'Reptiles', label: null, sort_order: 1, is_visible: true, has_override: true, in_catalog: false },
      ],
      total: 2,
    }
    apiGetAuth.mockImplementation(async (path) => {
      if (path === '/admin/categories') return orphanCats
      return { items: [], total: 0 }
    })
    apiPostAuth.mockResolvedValue({ success: true, count: 1, removed: 1 })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'Categories').click() })
    await flush()
    const rm = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Remove')
    expect(rm).toBeTruthy()
    await act(async () => { rm.click() })
    await flush()
    expect(c.textContent).not.toMatch(/Reptiles/)
    const save = button(c, 'Save changes')
    expect(save.disabled).toBe(false)
    await act(async () => { save.click() })
    await flush()
    const [path, body] = apiPostAuth.mock.calls[0]
    expect(path).toBe('/admin/categories')
    expect(body.items.map((i) => i.name)).toEqual(['Birds'])
    expect(body.removed).toEqual(['Reptiles'])
  })
})
