// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchSiteContent, resetSiteContentCache } from './siteContent'

const payload = { seeded: true, banners: [], announcement: [], promo_strip: [], category_top: [], sections: [], nav: {}, promos: [] }

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
