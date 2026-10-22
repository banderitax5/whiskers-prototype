// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/siteContent', () => ({
  fetchSiteContent: vi.fn(async () => ({})),
  contentBanners: vi.fn(() => null),
  contentNav: vi.fn(() => null),
  trackBannerEvent: vi.fn(async () => {}),
}))

import NavLinks from './NavLinks.jsx'
import { contentBanners, fetchSiteContent, trackBannerEvent } from '../lib/siteContent'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render(path = '/') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <NavLinks />
      </MemoryRouter>
    )
  })
  cleanup = () => act(() => root.unmount())
  return container
}

// banner rows as the site-content endpoint sends them: desktop_image_url +
// alt (NOT the legacy image/label shape the tile used to expect)
const bannerRow = (over = {}) => ({
  id: '11111111-2222-3333-4444-555555555555',
  placement: 'brand_strip',
  desktop_image_url: '/brands/royal.webp',
  mobile_image_url: null,
  alt: 'Royal Canin',
  title: null,
  subtitle: null,
  button_text: null,
  link_type: 'brand',
  link_target: '/menu?brand=Royal%20Canin',
  sort_order: 0,
  ...over,
})

describe('NavLinks brand tiles', () => {
  it('renders seeded banner rows with their image and brand label', async () => {
    contentBanners.mockImplementation((_c, key) =>
      key === 'brand_strip' ? [bannerRow(), bannerRow({ id: '22222222-3333-4444-5555-666666666666', desktop_image_url: '/brands/aozi.png', alt: 'Aozi', link_target: '/menu?brand=Aozi' })] : null
    )
    const c = await render()
    const imgs = [...c.querySelectorAll('a[aria-label^="Shop"] img')]
    expect(imgs).toHaveLength(2)
    expect(imgs[0].getAttribute('src')).toBe('/brands/royal.webp')
    expect(imgs[0].alt).toBe('Royal Canin')
    expect(c.querySelector('a[href="/menu?brand=Royal%20Canin"]')).toBeTruthy()
    expect(c.querySelector('a[href="/menu?brand=Aozi"]')).toBeTruthy()
    expect(trackBannerEvent).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555', 'impression')
  })

  it('legacy rows whose link cannot be read still open their own brand menu', async () => {
    contentBanners.mockImplementation((_c, key) =>
      key === 'brand_strip'
        ? [bannerRow({ link_type: 'category', link_target: 'Aozi', alt: 'Aozi' })]
        : null
    )
    const c = await render()
    expect(c.querySelector('a[href="/menu?brand=Aozi"]')).toBeTruthy()
  })

  it('highlights the tile matching the brand in the URL', async () => {
    contentBanners.mockImplementation((_c, key) =>
      key === 'brand_strip' ? [bannerRow({ alt: 'Aozi', link_target: '/menu?brand=Aozi' })] : null
    )
    const c = await render('/menu?brand=Aozi')
    const tile = c.querySelector('a[href="/menu?brand=Aozi"]')
    expect(tile.className).toContain('ring-2')
  })

  it('falls back to the built-in tiles only when content is unavailable', async () => {
    fetchSiteContent.mockResolvedValue(null)
    contentBanners.mockImplementation(() => null)
    const c = await render()
    const tiles = [...c.querySelectorAll('a[aria-label^="Shop"]')]
    expect(tiles.length).toBeGreaterThanOrEqual(5)
    expect(c.querySelector('img[src="/brands/ROYAL.webp"]')).toBeTruthy()
  })

  it('drafting every brand tile renders no tiles (content wins over defaults)', async () => {
    fetchSiteContent.mockResolvedValue({})
    contentBanners.mockImplementation(() => null)
    const c = await render()
    expect(c.querySelectorAll('a[aria-label^="Shop"]')).toHaveLength(0)
  })
})
