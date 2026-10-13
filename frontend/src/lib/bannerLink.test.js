import { describe, test, expect } from 'vitest'
import { bannerHref } from './bannerLink'

describe('bannerHref', () => {
  test('no link / none / empty targets resolve to null', () => {
    expect(bannerHref(null)).toBeNull()
    expect(bannerHref({ link_type: 'none', link_target: '/menu' })).toBeNull()
    expect(bannerHref({ link_type: 'category', link_target: '  ' })).toBeNull()
    expect(bannerHref({ link_type: 'category' })).toBeNull()
  })

  test('product targets accept stored paths and bare uuids', () => {
    expect(bannerHref({ link_type: 'product', link_target: '/products/11111111-2222-3333-4444-555555555555' })).toBe('/products/11111111-2222-3333-4444-555555555555')
    expect(bannerHref({ link_type: 'product', link_target: '11111111-2222-3333-4444-555555555555' })).toBe('/products/11111111-2222-3333-4444-555555555555')
    expect(bannerHref({ link_type: 'product', link_target: 'not-a-uuid' })).toBeNull()
  })

  test('brand links accept picker paths and legacy bare brand names', () => {
    expect(bannerHref({ link_type: 'brand', link_target: '/menu?brand=Aozi' })).toBe('/menu?brand=Aozi')
    expect(bannerHref({ link_type: 'brand', link_target: 'Royal Canin' })).toBe('/menu?brand=Royal%20Canin')
  })

  test('category and promo only link to site paths (no guessing)', () => {
    expect(bannerHref({ link_type: 'category', link_target: '/menu?category=Dogs' })).toBe('/menu?category=Dogs')
    expect(bannerHref({ link_type: 'category', link_target: 'Dogs' })).toBeNull()
    expect(bannerHref({ link_type: 'promo', link_target: '/menu?promo=X' })).toBe('/menu?promo=X')
    expect(bannerHref({ link_type: 'promo', link_target: 'X' })).toBeNull()
  })

  test('url links allow absolute and site paths only', () => {
    expect(bannerHref({ link_type: 'url', link_target: 'https://facebook.com/x' })).toBe('https://facebook.com/x')
    expect(bannerHref({ link_type: 'url', link_target: '/about' })).toBe('/about')
    expect(bannerHref({ link_type: 'url', link_target: 'javascript:alert(1)' })).toBeNull()
  })
})
