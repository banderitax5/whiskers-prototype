// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchSiteContent, resetSiteContentCache, applyCategoryOverrides } from './siteContent'

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
