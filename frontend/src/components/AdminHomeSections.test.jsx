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

import AdminHomeSections from './AdminHomeSections.jsx'
import { apiGetAuth } from '../lib/api'

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
  await act(async () => { root.render(<AdminHomeSections />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

const sample = {
  id: 's1',
  type: 'product_row',
  title: 'Featured dogs',
  config: { rule: 'category:Dogs' },
  status: 'published',
  starts_at: null,
  ends_at: null,
  sort_order: 0,
  archived_at: null,
}

describe('AdminHomeSections page states', () => {
  it('shows an empty state guiding the first draft', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/No home sections yet/i)
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'New section')).toBe(true)
  })

  it('lists a section card with type, status and rule summary', async () => {
    apiGetAuth.mockResolvedValue({ items: [sample], total: 1 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/Published/)
    expect(c.textContent).toMatch(/Featured dogs/)
    expect(c.textContent).toMatch(/Product row/)
    expect(c.textContent).toMatch(/Category: Dogs/)
    expect(c.querySelector('img')).toBeNull()
  })

  it('shows an error with retry and never claims the list is empty', async () => {
    apiGetAuth.mockRejectedValueOnce(new Error('nope'))
    const c = await render()
    await flush()
    const alert = c.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/nope/)
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(true)
    expect(c.textContent).not.toMatch(/No home sections yet/i)
  })

  it('new-section dialog has no Type picker (hero/brand/promo live under Banners)', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    const btn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'New section')
    await act(async () => { btn.click() })
    expect(c.querySelector('#sec-type')).toBeNull()
    expect(c.textContent).not.toMatch(/Hero carousel/)
    expect(c.textContent).toMatch(/New product row/)
    expect(c.querySelector('#sec-title')).not.toBeNull()
  })
})
