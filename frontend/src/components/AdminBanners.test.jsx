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

import AdminBanners from './AdminBanners.jsx'
import { apiGet, apiGetAuth, apiPatchAuth } from '../lib/api'

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
  await act(async () => { root.render(<AdminBanners />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

const sampleBanner = {
  id: 'b1',
  placement: 'home_hero',
  desktop_image_url: '/banner.png',
  mobile_image_url: null,
  alt: 'Nutri Chunks promo slide',
  title: 'New arrivals',
  subtitle: null,
  button_text: 'Shop now',
  link_type: 'category',
  link_target: '/menu?category=Dogs',
  status: 'published',
  starts_at: null,
  ends_at: null,
  sort_order: 0,
  impressions: 120,
  clicks: 12,
  archived_at: null,
}

describe('AdminBanners page states', () => {
  it('shows placement tabs and an empty state when the spot has no banners', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/No banners here yet/i)
    expect(c.textContent).toMatch(/Hero carousel/i)
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'New banner')).toBe(true)
  })

  it('lists a banner card with status, order and counters', async () => {
    apiGetAuth.mockResolvedValue({ items: [sampleBanner], total: 1 })
    const c = await render()
    await flush()
    expect(c.textContent).toMatch(/Published/)
    expect(c.textContent).toMatch(/Nutri Chunks promo slide/)
    expect(c.textContent).toMatch(/Views 120/)
    expect(c.textContent).toMatch(/Clicks 12/)
    expect(c.textContent).toMatch(/CTR 10%/)
    expect(c.querySelector('img[src="/banner.png"]')?.alt).toBe('Nutri Chunks promo slide')
    // first item cannot move up; only one item so it cannot move down either
    const up = [...c.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Move'))
    expect(up?.disabled).toBe(true)
  })

  it('shows an error with retry and never claims the list is empty', async () => {
    apiGetAuth.mockRejectedValueOnce(new Error('boom'))
    const c = await render()
    await flush()
    const alert = c.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/boom/)
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(true)
    expect(c.textContent).not.toMatch(/No banners here yet/i)
  })

  it('requests the selected placement with the archived flag', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    await render()
    await flush()
    expect(apiGetAuth).toHaveBeenCalledWith(expect.stringContaining('placement=home_hero'), expect.anything())
    expect(apiGetAuth).toHaveBeenCalledWith(expect.stringContaining('archived=false'), expect.anything())
  })

  it('offers friendly link choices and an image picker instead of raw paths', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const c = await render()
    await flush()
    const newBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'New banner')
    await act(async () => { newBtn.click() })
    await flush()
    const dlg = c.querySelector('[role="dialog"]')
    expect(dlg).toBeTruthy()
    expect(dlg.textContent).toMatch(/Where should this banner link\?/)
    const typeSel = dlg.querySelector('#b-linktype')
    const labels = [...typeSel.options].map((o) => o.textContent)
    expect(labels).toEqual(['No link', 'A product', 'A category', 'A brand', 'A promotion', 'A web page'])
    // image fields are pickers (Library / Paste link), not raw path inputs
    expect([...dlg.querySelectorAll('button')].some((b) => b.textContent === 'Library')).toBe(true)
    expect([...dlg.querySelectorAll('button')].some((b) => b.textContent === 'Paste link')).toBe(true)
    expect(dlg.querySelector('input#b-desktop')).toBeNull()
  })

  it('category links are chosen from real category names', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    apiGet.mockResolvedValue({ items: ['Dogs', 'Cats'] })
    const c = await render()
    await flush()
    const newBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'New banner')
    await act(async () => { newBtn.click() })
    await flush()
    const dlg = c.querySelector('[role="dialog"]')
    const typeSel = dlg.querySelector('#b-linktype')
    await act(async () => {
      typeSel.value = 'category'
      typeSel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    const catSel = dlg.querySelector('#b-target-category')
    expect(catSel).toBeTruthy()
    const opts = [...catSel.options].map((o) => o.textContent)
    expect(opts).toContain('Dogs')
    expect(opts).toContain('Cats')
    expect(dlg.textContent).toMatch(/land on the shop page filtered/)
  })

  it('legacy rows with an unreadable link open editable, link turned off with a note', async () => {
    const legacy = { ...sampleBanner, id: 'b9', link_type: 'category', link_target: 'Aozi' }
    apiGetAuth.mockResolvedValue({ items: [legacy], total: 1 })
    const c = await render()
    await flush()
    const editBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Edit')
    await act(async () => { editBtn.click() })
    await flush()
    const dlg = c.querySelector('[role="dialog"]')
    const typeSel = dlg.querySelector('#b-linktype')
    expect(typeSel.value).toBe('none')
    expect(dlg.textContent).toMatch(/destination couldn’t be read/)
    // every other field stays editable; the stale bare target is gone from
    // the form so saving with "No link" succeeds instead of 400-ing
    expect(dlg.querySelector('#b-alt').value).toBe(legacy.alt)
  })

  it('brand links are chosen from real brand names', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    apiGet.mockResolvedValue({ items: ['Aozi', 'Royal Canin'] })
    const c = await render()
    await flush()
    const newBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'New banner')
    await act(async () => { newBtn.click() })
    await flush()
    const dlg = c.querySelector('[role="dialog"]')
    const typeSel = dlg.querySelector('#b-linktype')
    await act(async () => {
      typeSel.value = 'brand'
      typeSel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    const brandSel = dlg.querySelector('#b-target-brand')
    expect(brandSel).toBeTruthy()
    const opts = [...brandSel.options].map((o) => o.textContent)
    expect(opts).toContain('Aozi')
    expect(opts).toContain('Royal Canin')
    // picking a brand stores the /menu?brand= link the storefront resolves
    await act(async () => {
      brandSel.value = 'Aozi'
      brandSel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(dlg.textContent).toMatch(/filtered to this brand/)
  })

  it('bulk publish: select-all then one PATCH per banner', async () => {
    const second = { ...sampleBanner, id: 'b2', alt: 'Second slide', sort_order: 1 }
    apiGetAuth.mockResolvedValue({ items: [sampleBanner, second], total: 2 })
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
      ['/admin/banners/b1', { status: 'published' }],
      ['/admin/banners/b2', { status: 'published' }],
    ])
    expect(c.textContent).toMatch(/Published 2 banners/)
    // selection is cleared once the bulk action lands
    expect(c.textContent).not.toContain('2 selected')
  })
})
