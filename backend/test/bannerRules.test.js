import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeBanner, PLACEMENTS } from '../src/utils/bannerRules.js'

const base = {
  placement: 'home_hero',
  desktop_image_url: '/banner.png',
  alt: 'Nutri Chunks promo slide',
  status: 'published',
}

describe('sanitizeBanner create', () => {
  test('accepts a minimal published banner and fills defaults', () => {
    const r = sanitizeBanner(base)
    assert.equal(r.ok, true)
    assert.equal(r.values.desktop_image_url, '/banner.png')
    assert.equal(r.values.mobile_image_url, null)
    assert.equal(r.values.link_type, 'none')
    assert.equal(r.values.link_target, null)
    assert.equal(r.values.starts_at, null)
  })

  test('rejects unknown placement and missing desktop image', () => {
    assert.match(sanitizeBanner({ ...base, placement: 'footer' }).error, /Placement/)
    assert.match(sanitizeBanner({ ...base, desktop_image_url: undefined }).error, /required/i)
  })

  test('alt text is required', () => {
    assert.match(sanitizeBanner({ ...base, alt: '  ' }).error, /Alt text is required/)
  })

  test('image URLs must be site paths or http(s)', () => {
    assert.equal(sanitizeBanner({ ...base, mobile_image_url: 'https://cdn.x/m.jpg' }).ok, true)
    assert.match(sanitizeBanner({ ...base, desktop_image_url: 'ftp://x/a.jpg' }).error, /site path/)
  })
})

describe('sanitizeBanner links', () => {
  test('url links must be absolute http(s), target links must be site paths', () => {
    assert.equal(sanitizeBanner({ ...base, link_type: 'url', link_target: 'https://facebook.com/x' }).ok, true)
    assert.match(sanitizeBanner({ ...base, link_type: 'url', link_target: '/menu' }).error, /http/)
    assert.equal(sanitizeBanner({ ...base, link_type: 'category', link_target: '/menu?category=Dogs' }).ok, true)
    assert.match(sanitizeBanner({ ...base, link_type: 'product', link_target: 'abc' }).error, /start with \//)
  })

  test('link target required unless type is none', () => {
    assert.match(sanitizeBanner({ ...base, link_type: 'promo' }).error, /target/i)
    assert.equal(sanitizeBanner({ ...base, link_type: 'none', link_target: '/ignored' }).values.link_target, null)
  })
})

describe('sanitizeBanner schedule', () => {
  test('scheduled status requires a start date', () => {
    assert.match(sanitizeBanner({ ...base, status: 'scheduled' }).error, /start date/i)
  })

  test('ends must come after starts', () => {
    const bad = sanitizeBanner({ ...base, status: 'scheduled', starts_at: '2026-11-01T00:00:00+08:00', ends_at: '2026-10-01T00:00:00+08:00' })
    assert.match(bad.error, /after/)
    const good = sanitizeBanner({ ...base, status: 'scheduled', starts_at: '2026-10-01T00:00:00+08:00', ends_at: '2026-11-01T00:00:00+08:00' })
    assert.equal(good.ok, true)
  })
})

describe('sanitizeBanner partial updates', () => {
  test('patch only touches provided fields and does not re-require alt', () => {
    const r = sanitizeBanner({ title: 'New title' }, { partial: true })
    assert.equal(r.ok, true)
    assert.deepEqual(Object.keys(r.values), ['title'])
  })

  test('changing the image re-requires alt', () => {
    assert.match(sanitizeBanner({ desktop_image_url: '/new.png' }, { partial: true }).error, /Alt text/)
    assert.equal(sanitizeBanner({ desktop_image_url: '/new.png', alt: 'Fresh slide' }, { partial: true }).ok, true)
  })
})

test('every placement in the admin list is valid', () => {
  for (const p of PLACEMENTS) {
    assert.equal(sanitizeBanner({ ...base, placement: p }).ok, true, p)
  }
})
