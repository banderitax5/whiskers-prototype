import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeNavItem, sanitizeCategoryBatch, NAV_SECTIONS } from '../src/utils/navRules.js'

const base = { section: 'navbar', label: 'About us', href: '/about' }

describe('sanitizeNavItem create', () => {
  test('accepts a minimal link and defaults visible + empty alt', () => {
    const r = sanitizeNavItem({ ...base })
    assert.equal(r.ok, true)
    assert.deepEqual(r.values, { section: 'navbar', label: 'About us', href: '/about', image_url: null, alt_text: '', is_visible: true })
  })

  test('accepts https links and trims whitespace', () => {
    const r = sanitizeNavItem({ section: 'footer_social', label: ' FB ', href: '  https://facebook.com/whiskers  ' })
    assert.equal(r.ok, true)
    assert.equal(r.values.href, 'https://facebook.com/whiskers')
    assert.equal(r.values.label, 'FB')
  })

  test('rejects unknown section and missing label', () => {
    assert.match(sanitizeNavItem({ ...base, section: 'sidebar' }).error, /Section must be/)
    assert.match(sanitizeNavItem({ ...base, label: '   ' }).error, /Label is required/)
    assert.match(sanitizeNavItem({ ...base, label: 'x'.repeat(61) }).error, /60 characters or fewer/)
  })

  test('rejects links that are not site paths or http(s)', () => {
    assert.match(sanitizeNavItem({ ...base, href: 'javascript:alert(1)' }).error, /Start the link with/)
    assert.match(sanitizeNavItem({ ...base, href: 'evil.com' }).error, /Start the link with/)
    assert.match(sanitizeNavItem({ ...base, href: '//evil.com' }).error, /site path/)
    assert.match(sanitizeNavItem({ ...base, href: '   ' }).error, /required/)
    // uppercase scheme fails the DB regex too, so reject before insert
    assert.match(sanitizeNavItem({ ...base, href: 'HTTPS://example.com' }).error, /Start the link with/)
    assert.equal(sanitizeNavItem({ ...base, href: '/' }).ok, true)
  })

  test('image accepts site paths and http(s), alt truncates at 120', () => {
    assert.equal(sanitizeNavItem({ ...base, image_url: '/logo.png' }).values.image_url, '/logo.png')
    assert.equal(sanitizeNavItem({ ...base, image_url: null }).values.image_url, null)
    assert.match(sanitizeNavItem({ ...base, image_url: 'data:text/html,x' }).error, /site path/)
    assert.match(sanitizeNavItem({ ...base, alt_text: 'x'.repeat(121) }).error, /120 characters or fewer/)
  })
})

describe('sanitizeNavItem patch (partial)', () => {
  test('only touched fields come back', () => {
    const r = sanitizeNavItem({ label: 'New label' }, { partial: true })
    assert.equal(r.ok, true)
    assert.deepEqual(r.values, { label: 'New label' })
  })

  test('section is still validated when supplied on a patch', () => {
    assert.match(sanitizeNavItem({ section: 'nope' }, { partial: true }).error, /Section must be/)
    assert.equal(sanitizeNavItem({ is_visible: false }, { partial: true }).values.is_visible, false)
    assert.match(sanitizeNavItem({ is_visible: 'yes' }, { partial: true }).error, /true or false/)
    // null alt clears to '' (DB column is not null)
    assert.equal(sanitizeNavItem({ alt_text: null }, { partial: true }).values.alt_text, '')
  })
})

describe('sanitizeCategoryBatch', () => {
  const row = (name, over = {}) => ({ name, label: null, sort_order: 0, is_visible: true, ...over })

  test('accepts a full merged list and normalizes fields', () => {
    const r = sanitizeCategoryBatch([
      row('Dogs', { sort_order: 0, label: 'Dogs & puppies' }),
      row('Cats', { sort_order: 1, is_visible: false }),
      row('Birds', { sort_order: 2, label: '  ' }),
    ])
    assert.equal(r.ok, true)
    assert.equal(r.values.length, 3)
    assert.equal(r.values[0].label, 'Dogs & puppies')
    assert.equal(r.values[1].is_visible, false)
    assert.equal(r.values[2].label, null)
  })

  test('missing is_visible defaults to true; non-boolean is rejected', () => {
    assert.equal(sanitizeCategoryBatch([{ name: 'Dogs', sort_order: 0 }]).values[0].is_visible, true)
    assert.match(sanitizeCategoryBatch([{ name: 'Dogs', sort_order: 0, is_visible: 1 }]).error, /true or false/)
  })

  test('rejects non-arrays, empty lists and oversized lists', () => {
    assert.match(sanitizeCategoryBatch('Dogs').error, /categories list/)
    assert.match(sanitizeCategoryBatch([]).error, /at least one/)
    const many = Array.from({ length: 201 }, (_, i) => row(`c${i}`, { sort_order: i }))
    assert.match(sanitizeCategoryBatch(many).error, /at most 200/)
  })

  test('rejects missing/duplicate names and bad sort orders', () => {
    assert.match(sanitizeCategoryBatch([row(''), row('x', { sort_order: 1 })]).error, /needs a name/)
    assert.match(sanitizeCategoryBatch([row('Dogs', { sort_order: 0 }), row('Dogs', { sort_order: 1 })]).error, /Duplicate/)
    assert.match(sanitizeCategoryBatch([row('Dogs'), { name: 'Cats' }]).error, /whole number/)
    assert.match(sanitizeCategoryBatch([{ ...row('Dogs'), sort_order: -1 }]).error, /whole number/)
    assert.match(sanitizeCategoryBatch([{ ...row('Dogs'), sort_order: 1.5 }]).error, /whole number/)
  })
})

describe('NAV_SECTIONS', () => {
  test('matches the four sections the DB check allows', () => {
    assert.deepEqual(NAV_SECTIONS, ['navbar', 'footer_shop', 'footer_account', 'footer_social'])
  })
})
