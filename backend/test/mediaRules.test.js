import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeAltText, mediaPageParams, buildUsageIndex, MAX_ALT_LENGTH } from '../src/utils/mediaRules.js'

describe('sanitizeAltText', () => {
  test('accepts normal text and collapses whitespace', () => {
    assert.deepEqual(sanitizeAltText('  Dog   food  bag '), { ok: true, value: 'Dog food bag' })
  })

  test('requires alt text', () => {
    assert.equal(sanitizeAltText('').ok, false)
    assert.equal(sanitizeAltText('   ').ok, false)
    assert.equal(sanitizeAltText(undefined).ok, false)
    assert.match(sanitizeAltText('').error, /required/i)
  })

  test(`rejects alt text over ${MAX_ALT_LENGTH} characters`, () => {
    assert.equal(sanitizeAltText('x'.repeat(MAX_ALT_LENGTH)).ok, true)
    assert.equal(sanitizeAltText('x'.repeat(MAX_ALT_LENGTH + 1)).ok, false)
  })
})

describe('mediaPageParams', () => {
  test('defaults bad or missing values', () => {
    assert.deepEqual(mediaPageParams({}), { page: 1, pageSize: 12 })
    assert.deepEqual(mediaPageParams({ page: 'abc', pageSize: '-5' }), { page: 1, pageSize: 12 })
    assert.deepEqual(mediaPageParams({ page: '3', pageSize: '24' }), { page: 3, pageSize: 24 })
  })

  test('clamps page and pageSize', () => {
    assert.deepEqual(mediaPageParams({ page: '0', pageSize: '999' }), { page: 1, pageSize: 48 })
    assert.deepEqual(mediaPageParams({ page: '-2', pageSize: '13' }), { page: 1, pageSize: 13 })
  })
})

describe('buildUsageIndex', () => {
  const refs = {
    banners: [
      { id: 'b1', placement: 'home_hero', desktop_image_url: 'https://x/a.jpg', mobile_image_url: 'https://x/a-m.jpg' },
      { id: 'b2', placement: 'brand_strip', desktop_image_url: 'https://x/b.jpg', mobile_image_url: null },
    ],
    nav: [
      { id: 'n1', section: 'navbar', image_url: 'https://x/a.jpg' },
      { id: 'n2', section: 'footer_social', image_url: null },
    ],
    sections: [
      { id: 's1', type: 'promo_banner', title: 'Holiday', configText: '{"image_url":"https://x/b.jpg"}' },
      { id: 's2', type: 'text_block', title: 'About', configText: '{"body":"no images"}' },
    ],
  }

  test('finds every place an image is referenced', () => {
    const idx = buildUsageIndex(['https://x/a.jpg'], refs)
    assert.deepEqual(idx.get('https://x/a.jpg'), [
      { entity: 'banner', id: 'b1', label: 'Banner (home_hero)' },
      { entity: 'nav', id: 'n1', label: 'Nav item (navbar)' },
    ])
  })

  test('matches the mobile variant separately', () => {
    const idx = buildUsageIndex(['https://x/a-m.jpg'], refs)
    assert.deepEqual(idx.get('https://x/a-m.jpg'), [
      { entity: 'banner', id: 'b1', label: 'Banner mobile (home_hero)' },
    ])
  })

  test('finds usage inside home section config', () => {
    const idx = buildUsageIndex(['https://x/b.jpg'], refs)
    assert.deepEqual(idx.get('https://x/b.jpg'), [
      { entity: 'banner', id: 'b2', label: 'Banner (brand_strip)' },
      { entity: 'section', id: 's1', label: 'Home section (Holiday)' },
    ])
  })

  test('returns an empty list for unused images', () => {
    const idx = buildUsageIndex(['https://x/unused.jpg'], refs)
    assert.deepEqual(idx.get('https://x/unused.jpg'), [])
  })
})
