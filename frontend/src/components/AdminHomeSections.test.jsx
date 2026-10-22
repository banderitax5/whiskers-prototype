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

  it('bulk publish: select-all then one PATCH per row', async () => {
    const second = { ...sample, id: 's2', title: 'New arrivals', sort_order: 1 }
    apiGetAuth.mockResolvedValue({ items: [sample, second], total: 2 })
    apiPatchAuth.mockResolvedValue({ item: {} })
    const c = await render()
    await flush()

    const allLabel = [...c.querySelectorAll('label')].find((l) => /Select all/.test(l.textContent))
    expect(allLabel).toBeTruthy()
    await act(async () => { allLabel.querySelector('input').click() })
    expect(c.textContent).toContain('2 selected')

    const pubBtn = [...c.querySelectorAll('button')].find((b) => /Publish 2/.test(b.textContent))
    expect(pubBtn).toBeTruthy()
    await act(async () => { pubBtn.click() })
    await flush()

    expect(apiPatchAuth.mock.calls.map((a) => [a[0], a[1]])).toEqual([
      ['/admin/sections/s1', { status: 'published' }],
      ['/admin/sections/s2', { status: 'published' }],
    ])
    expect(c.textContent).toMatch(/Published 2 rows/)
    expect(c.textContent).not.toContain('2 selected')
  })

  it('archived view lists each row once, in the restore list', async () => {
    const archivedRow = { ...sample, archived_at: '2026-10-10T00:00:00Z' }
    apiGetAuth.mockResolvedValue({ items: [archivedRow], total: 1 })
    const c = await render()
    await flush()

    const showArchived = [...c.querySelectorAll('label')].find((l) => /Show archived/.test(l.textContent))
    await act(async () => { showArchived.querySelector('input').click() })
    await flush()

    // the restore list owns archived rows - not a second copy as reorder cards
    expect((c.textContent.match(/Featured dogs/g) || []).length).toBe(1)
    expect([...c.querySelectorAll('button')].filter((b) => b.textContent === 'Restore')).toHaveLength(1)
    expect(c.querySelector('[data-sort-index]')).toBeNull()
  })
})
