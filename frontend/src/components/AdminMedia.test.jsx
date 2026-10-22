// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// the page imports these through the chain; stub them so the test exercises
// states (loading, empty, error) without a live backend
vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
}))
vi.mock('../lib/api', () => ({
  apiGetAuth: vi.fn(),
  apiPostAuth: vi.fn(),
  apiPatchAuth: vi.fn(),
  apiDeleteAuth: vi.fn(),
  apiUploadAuth: vi.fn(),
}))

import AdminMedia from './AdminMedia.jsx'
import { apiGetAuth, apiDeleteAuth } from '../lib/api'

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
  await act(async () => { root.render(<AdminMedia />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

describe('AdminMedia page states', () => {
  it('renders an empty state with guidance when there are no images', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/No images yet/i)
    expect(c.textContent).toMatch(/Upload the first banner/i)
    expect(c.querySelector('input#media-search')).toBeTruthy()
  })

  it('shows an error with a retry button when loading fails', async () => {
    apiGetAuth.mockRejectedValueOnce(new Error('boom'))
    const c = await render()
    await flush()
    const alert = c.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/boom/)
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(true)
    // a failed load must never claim the library is empty
    expect(c.textContent).not.toMatch(/No images yet/i)
  })

  it('renders media cards with alt text, usage and broken badge', async () => {
    apiGetAuth.mockResolvedValue({
      items: [{
        id: 'm1',
        url: 'https://cdn.test/hero.jpg',
        storage_path: 'hero.jpg',
        alt_text: 'Dog eating Nutri Chunks',
        size_bytes: 245000,
        width: 1600,
        height: 600,
        is_broken: true,
        used_in: [{ entity: 'banner', id: 'b1', label: 'Banner (home_hero)' }],
        archived_at: null,
        created_at: '2026-10-13T00:00:00Z',
      }],
      total: 1,
    })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/Dog eating Nutri Chunks/)
    expect(c.textContent).toMatch(/Banner \(home_hero\)/)
    expect(c.textContent).toMatch(/Broken/)
    expect(c.textContent).toMatch(/1600×600/)
    const img = c.querySelector('img')
    expect(img?.getAttribute('alt')).toBe('Dog eating Nutri Chunks')
    expect(c.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/hero.jpg')
  })

  it('bulk archives: select-all, confirm dialog, one DELETE per id', async () => {
    const row = (id, alt) => ({
      id, url: `https://cdn.test/${id}.jpg`, storage_path: `${id}.jpg`,
      alt_text: alt, size_bytes: 1, width: 1600, height: 600, is_broken: false,
      used_in: [], archived_at: null, created_at: '2026-10-13T00:00:00Z',
    })
    apiGetAuth.mockResolvedValue({ items: [row('m1', 'First'), row('m2', 'Second')], total: 2 })
    apiDeleteAuth.mockResolvedValue({ success: true })
    const c = await render()
    await flush()

    const allLabel = [...c.querySelectorAll('label')].find((l) => /Select all/.test(l.textContent))
    expect(allLabel).toBeTruthy()
    await act(async () => { allLabel.querySelector('input').click() })
    expect(c.textContent).toContain('2 selected')

    const archiveBtn = [...c.querySelectorAll('button')].find((b) => /Archive 2/.test(b.textContent))
    expect(archiveBtn).toBeTruthy()
    await act(async () => { archiveBtn.click() })

    const dialog = c.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toMatch(/Archive 2 images\?/)
    const confirmBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Archive')
    expect(confirmBtn).toBeTruthy()
    await act(async () => { confirmBtn.click() })
    await flush()

    expect(apiDeleteAuth.mock.calls.map((a) => a[0])).toEqual(['/admin/media/m1', '/admin/media/m2'])
    expect(c.textContent).toMatch(/Archived 2 images/)
    expect(c.textContent).not.toContain('2 selected')
  })
})
