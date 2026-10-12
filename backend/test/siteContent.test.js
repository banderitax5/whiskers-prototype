import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isVisible,
  visibleRows,
  bannersFor,
  safeHref,
  parseRule,
  applyReorder,
  isValidSection,
} from '../src/utils/siteContent.js'

const NOW = new Date('2026-10-13T12:00:00Z')

function row(overrides = {}) {
  return { id: 'x', sort_order: 0, status: 'published', archived_at: null, ...overrides }
}

describe('siteContent visibility', () => {
  test('published and in-window rows are visible', () => {
    assert.equal(isVisible(row(), NOW), true)
  })

  test('draft rows are never visible', () => {
    assert.equal(isVisible(row({ status: 'draft' }), NOW), false)
  })

  test('scheduled rows appear once their window arrives', () => {
    const future = row({ status: 'scheduled', starts_at: '2026-10-13T13:00:00Z' })
    const live = row({ status: 'scheduled', starts_at: '2026-10-13T11:00:00Z' })
    assert.equal(isVisible(future, NOW), false)
    assert.equal(isVisible(live, NOW), true)
  })

  test('ended rows are hidden', () => {
    const ended = row({ ends_at: '2026-10-13T11:00:00Z' })
    assert.equal(isVisible(ended, NOW), false)
  })

  test('archived rows are hidden even when published', () => {
    assert.equal(isVisible(row({ archived_at: '2026-10-01T00:00:00Z' }), NOW), false)
  })

  test('visibleRows sorts by sort_order and drops hidden rows', () => {
    const rows = [
      row({ id: 'b', sort_order: 2 }),
      row({ id: 'a', sort_order: 1 }),
      row({ id: 'hidden', sort_order: 0, status: 'draft' }),
    ]
    assert.deepEqual(visibleRows(rows, NOW).map((r) => r.id), ['a', 'b'])
  })

  test('non-array input is tolerated', () => {
    assert.deepEqual(visibleRows(null, NOW), [])
  })
})

describe('siteContent banners', () => {
  test('bannersFor accepts several placements at once', () => {
    const banners = [
      row({ id: 'strip', placement: 'promo_strip', sort_order: 1 }),
      row({ id: 'top', placement: 'category_top', sort_order: 0 }),
      row({ id: 'hero', placement: 'home_hero', sort_order: 0 }),
    ]
    assert.deepEqual(bannersFor(['promo_strip', 'category_top'], banners, NOW).map((b) => b.id), ['top', 'strip'])
  })

  test('bannersFor filters by placement and order', () => {
    const banners = [
      row({ id: 'hero2', placement: 'home_hero', sort_order: 2 }),
      row({ id: 'strip', placement: 'promo_strip', sort_order: 0 }),
      row({ id: 'hero1', placement: 'home_hero', sort_order: 1 }),
    ]
    assert.deepEqual(bannersFor('home_hero', banners, NOW).map((b) => b.id), ['hero1', 'hero2'])
    assert.deepEqual(bannersFor('promo_strip', banners, NOW).map((b) => b.id), ['strip'])
    assert.deepEqual(bannersFor('category_top', banners, NOW), [])
  })
})

describe('siteContent safeHref', () => {
  test('internal and http(s) targets pass through', () => {
    assert.equal(safeHref('url', 'https://shop.example/x'), 'https://shop.example/x')
    assert.equal(safeHref('url', 'http://shop.example/x'), 'http://shop.example/x')
    assert.equal(safeHref('category', 'Dogs - DRY'), '/menu?category=Dogs%20-%20DRY')
  })

  test('javascript: and protocol-relative targets are dropped', () => {
    assert.equal(safeHref('url', 'javascript:alert(1)'), '#')
    assert.equal(safeHref('url', '//evil.example'), '#')
    // a category is only ever a filter value: it is encoded into an
    // internal path, so a hostile string cannot become a navigation target
    assert.equal(safeHref('category', 'javascript:alert(1)'), '/menu?category=javascript%3Aalert(1)')
  })

  test('empty targets and unknown types fall back to #', () => {
    assert.equal(safeHref('url', ''), '#')
    assert.equal(safeHref('none', 'https://x.example'), '#')
    assert.equal(safeHref('promo', ''), '#')
    assert.equal(safeHref('product', ''), '#')
  })
})

describe('siteContent rules', () => {
  test('manual is the default', () => {
    assert.deepEqual(parseRule({}), { kind: 'manual' })
    assert.deepEqual(parseRule({ rule: 'manual' }), { kind: 'manual' })
  })

  test('category and brand rules keep their value', () => {
    assert.deepEqual(parseRule({ rule: 'category:Dogs' }), { kind: 'category', value: 'Dogs' })
    assert.deepEqual(parseRule({ rule: 'brand:Royal Canin' }), { kind: 'brand', value: 'Royal Canin' })
  })

  test('known rule kinds are recognised', () => {
    assert.deepEqual(parseRule({ rule: 'best_sellers_30d' }), { kind: 'best_sellers_30d' })
    assert.deepEqual(parseRule({ rule: 'newest' }), { kind: 'newest' })
    assert.deepEqual(parseRule({ rule: 'on_sale' }), { kind: 'on_sale' })
  })

  test('unknown rule falls back to manual', () => {
    assert.deepEqual(parseRule({ rule: 'wat' }), { kind: 'manual' })
  })
})

describe('siteContent reorder', () => {
  const rows = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ]

  test('drag order is applied densely', () => {
    const out = applyReorder(rows, ['c', 'b', 'a'])
    assert.deepEqual(out.map((r) => [r.id, r.sort_order]), [['c', 0], ['b', 1], ['a', 2]])
  })

  test('unmentioned rows keep their order after the moved ones', () => {
    const out = applyReorder(rows, ['b'])
    assert.deepEqual(out.map((r) => r.id), ['b', 'a', 'c'])
    assert.deepEqual(out.map((r) => r.sort_order), [0, 1, 2])
  })

  test('bad payload leaves rows untouched', () => {
    assert.deepEqual(applyReorder(rows, null).map((r) => r.sort_order), [0, 1, 2])
  })
})

describe('siteContent validity', () => {
  test('a product_row needs manual product ids or a rule', () => {
    assert.equal(isValidSection({ type: 'product_row', status: 'published', config: { rule: 'manual', product_ids: ['1'] } }), true)
    assert.equal(isValidSection({ type: 'product_row', status: 'published', config: { rule: 'manual' } }), false)
    assert.equal(isValidSection({ type: 'product_row', status: 'published', config: { rule: 'newest' } }), true)
  })

  test('other types need a status and a type only', () => {
    assert.equal(isValidSection({ type: 'text_block', status: 'draft' }), true)
    assert.equal(isValidSection({ type: 'text_block', status: 'wat' }), false)
    assert.equal(isValidSection(null), false)
  })
})
