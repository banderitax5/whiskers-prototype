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

import AdminSettings from './AdminSettings.jsx'
import { apiGetAuth, apiPatchAuth } from '../lib/api'

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
  await act(async () => { root.render(<AdminSettings />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

function mockAll({ settings = {}, items = [] } = {}) {
  apiGetAuth.mockImplementation(async (path) => {
    if (path.startsWith('/admin/settings')) {
      return { settings, updated_at: null, updated_by: null, seeded: true }
    }
    if (path.startsWith('/admin/faqs')) return { items: items.filter((i) => i.kind === 'faq'), total: items.length }
    if (path.startsWith('/admin/policies')) return { items: items.filter((i) => i.kind === 'policy'), total: items.length }
    return {}
  })
}

describe('AdminSettings', () => {
  it('renders the three tabs and loads the store name', async () => {
    mockAll({ settings: { store_name: 'Happy Paws', shipping_fee: 40 } })
    const c = await render()
    await flush()
    expect(button(c, 'Store settings')).toBeTruthy()
    expect(button(c, 'FAQs')).toBeTruthy()
    expect(button(c, 'Policy pages')).toBeTruthy()
    // input values do not appear in textContent - assert the controlled value
    const nameInput = c.querySelector('#store-name')
    expect(nameInput.value).toBe('Happy Paws')
    expect(c.textContent).toMatch(/Shown in/i)
  })

  it('surfaces a load error with a retry', async () => {
    apiGetAuth.mockImplementation(async (path) => {
      if (path.startsWith('/admin/settings')) throw new Error('boom')
      return { items: [] }
    })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/Failed to load settings|boom/i)
    expect(button(c, 'Retry')).toBeTruthy()
  })

  it('saves the form as a settings PATCH', async () => {
    mockAll({ settings: { store_name: 'Happy Paws' } })
    apiPatchAuth.mockResolvedValue({ settings: { store_name: 'Happy Paws' }, updated_at: '2026-10-14' })
    const c = await render()
    await flush()
    const save = button(c, 'Save settings')
    expect(save).toBeTruthy()
    await act(async () => { save.click() })
    await flush()
    expect(apiPatchAuth).toHaveBeenCalledTimes(1)
    const [path, body] = apiPatchAuth.mock.calls[0]
    expect(path).toBe('/admin/settings')
    expect(body.store_name).toBe('Happy Paws')
    expect(body.shipping_fee).toBe(75)
  })

  it('lists FAQ rows on the FAQs tab', async () => {
    mockAll({
      items: [
        { id: 'f1', kind: 'faq', question: 'How do I order?', answer: 'Browse and checkout.', sort_order: 0, is_visible: true, archived_at: null },
      ],
    })
    const c = await render()
    await flush()
    await act(async () => { button(c, 'FAQs').click() })
    await flush()
    expect(c.textContent).toMatch(/How do I order/)
  })
})
