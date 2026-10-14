// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  fetchSiteContent,
  resetSiteContentCache,
  applyCategoryOverrides,
  consumePreviewParam,
  isPreviewMode,
  exitPreview,
  contentSettings,
  contentFaqs,
  contentPolicies,
  CLIENT_DEFAULT_SETTINGS,
} from './siteContent'

vi.mock('./supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } },
}))

const payload = { seeded: true, banners: [], announcement: [], promo_strip: [], category_top: [], sections: [], nav: {}, promos: [], categories: [] }

describe('fetchSiteContent caching', () => {
  beforeEach(() => {
    resetSiteContentCache()
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
  })
  afterEach(() => vi.clearAllMocks())

  test('repeated calls share one request per page load', async () => {
    const [a, b] = await Promise.all([fetchSiteContent(), fetchSiteContent()])
    expect(a).toBe(payload)
    expect(b).toBe(payload)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('force drops the cached snapshot so admin edits show on the next visit', async () => {
    await fetchSiteContent()
    expect(fetch).toHaveBeenCalledTimes(1)
    await fetchSiteContent(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('unseeded responses are not cached as content', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ seeded: false }) }))
    expect(await fetchSiteContent()).toBeNull()
    await fetchSiteContent(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('applyCategoryOverrides', () => {
  const base = ['Birds', 'Cats', 'Dogs']

  test('no rows leaves the base list exactly as it was', () => {
    expect(applyCategoryOverrides(base, [])).toEqual([
      { name: 'Birds', label: 'Birds' },
      { name: 'Cats', label: 'Cats' },
      { name: 'Dogs', label: 'Dogs' },
    ])
    expect(applyCategoryOverrides(base, undefined)).toEqual(applyCategoryOverrides(base, []))
  })

  test('hidden rows drop out; labels replace display text only', () => {
    const out = applyCategoryOverrides(base, [
      { name: 'Birds', label: 'Pet birds', sort_order: 0, is_visible: true },
      { name: 'Cats', label: null, sort_order: 1, is_visible: false },
    ])
    expect(out.map((c) => c.name)).toEqual(['Birds', 'Dogs'])
    expect(out[0].label).toBe('Pet birds')
    expect(out[1].label).toBe('Dogs')
  })

  test('saved sort_order wins and unsaved categories come after them', () => {
    const out = applyCategoryOverrides(base, [
      { name: 'Dogs', label: null, sort_order: 0, is_visible: true },
      { name: 'Birds', label: null, sort_order: 5, is_visible: true },
    ])
    // saved categories first (0, 5), then never-saved Cats in base order
    expect(out.map((c) => c.name)).toEqual(['Dogs', 'Birds', 'Cats'])
  })

  test('non-integer sort_order and unknown override names are ignored', () => {
    const out = applyCategoryOverrides(base, [
      { name: 'Dogs', label: null, sort_order: 'x', is_visible: true },
      { name: 'Not a category', label: 'ghost', sort_order: 0, is_visible: true },
      null,
    ])
    expect(out.map((c) => c.name)).toEqual(base)
  })

  test('handles a missing base list gracefully', () => {
    expect(applyCategoryOverrides(undefined, [])).toEqual([])
  })
})

describe('preview mode (5g)', () => {
  beforeEach(() => {
    resetSiteContentCache()
    exitPreview()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      json: async () => (String(url).includes('preview=1') ? { ...payload, preview: true } : payload),
    }))
  })
  afterEach(() => {
    vi.clearAllMocks()
    exitPreview()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  test('?scPreview=1 arms preview for the tab and is stripped from the URL', () => {
    window.history.replaceState({}, '', '/?scPreview=1&utm_source=x')
    expect(consumePreviewParam()).toBe(true)
    expect(isPreviewMode()).toBe(true)
    expect(window.location.search).toBe('?utm_source=x')
    expect(Number(sessionStorage.getItem('scPreviewUntil'))).toBeGreaterThan(Date.now())
  })

  test('expired flag is ignored', () => {
    sessionStorage.setItem('scPreviewUntil', String(Date.now() - 1000))
    expect(consumePreviewParam()).toBe(false)
    expect(isPreviewMode()).toBe(false)
  })

  test('preview fetch sends the token and ?preview=1', async () => {
    window.history.replaceState({}, '', '/?scPreview=1')
    consumePreviewParam()
    const data = await fetchSiteContent()
    expect(data.preview).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('site-content?preview=1')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
  })

  test('exit preview returns to the public payload with no auth header', async () => {
    window.history.replaceState({}, '', '/?scPreview=1')
    consumePreviewParam()
    await fetchSiteContent()
    exitPreview()
    expect(isPreviewMode()).toBe(false)
    const data = await fetchSiteContent()
    expect(data).toBe(payload)
    const [url, opts] = fetch.mock.calls[1]
    expect(url).not.toContain('preview=1')
    expect(opts.headers.Authorization).toBeUndefined()
  })
})

describe('settings, faqs, policies (Phase 6)', () => {
  test('contentSettings falls back to the built-in defaults', () => {
    expect(contentSettings(null)).toEqual(CLIENT_DEFAULT_SETTINGS)
    expect(contentSettings({})).toEqual(CLIENT_DEFAULT_SETTINGS)
    expect(contentSettings({ settings: null }).store_name).toBe('Whiskers Pet Shop')
  })

  test('contentSettings merges saved values over the defaults', () => {
    const merged = contentSettings({
      settings: { store_name: 'Happy Paws', shipping_fee: 40, free_shipping_threshold: 999 },
    })
    expect(merged.store_name).toBe('Happy Paws')
    expect(merged.shipping_fee).toBe(40)
    expect(merged.free_shipping_threshold).toBe(999)
    // untouched defaults survive the merge
    expect(merged.maintenance.enabled).toBe(false)
    expect(merged.payment_methods).toHaveLength(3)
  })

  test('contentFaqs maps rows to q/a and returns null when empty', () => {
    expect(contentFaqs({})).toBeNull()
    expect(contentFaqs({ faqs: [] })).toBeNull()
    const rows = contentFaqs({ faqs: [{ question: 'Q1?', answer: 'A1' }] })
    expect(rows).toEqual([{ q: 'Q1?', a: 'A1' }])
  })

  test('contentPolicies returns rows or null', () => {
    expect(contentPolicies({})).toBeNull()
    const rows = [{ slug: 'shipping', title: 'Shipping', body: 'Body' }]
    expect(contentPolicies({ policies: rows })).toBe(rows)
  })
})
