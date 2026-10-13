import { describe, test, expect } from 'vitest'
import { saleFor, contentPromos } from './promoDisplay'

const product = { prod_id: 'p1', price: 265, category: 'Dogs' }

describe('saleFor', () => {
  test('sitewide percent promo discounts any priced product', () => {
    const r = saleFor(product, [{ type: 'percent', value: 10, scope: 'sitewide' }])
    expect(r).toEqual({ salePrice: 238.5, discountPct: 10 })
  })

  test('category and product scopes use string equality like the engine', () => {
    expect(saleFor(product, [{ type: 'percent', value: 20, scope: 'category', target_id: 'Dogs' }])?.salePrice).toBe(212)
    expect(saleFor(product, [{ type: 'percent', value: 20, scope: 'category', target_id: 'Cats' }])).toBeNull()
    expect(saleFor(product, [{ type: 'percent', value: 20, scope: 'product', target_id: 'p1' }])?.salePrice).toBe(212)
    expect(saleFor(product, [{ type: 'percent', value: 20, scope: 'product', target_id: 'p2' }])).toBeNull()
  })

  test('fixed and free-shipping promos never change the sticker price', () => {
    const promos = [
      { type: 'fixed', value: 50, scope: 'sitewide' },
      { type: 'free_shipping', value: 0, scope: 'sitewide' },
    ]
    expect(saleFor(product, promos)).toBeNull()
  })

  test('best percent wins; unpriced and empty inputs are null', () => {
    const promos = [
      { type: 'percent', value: 5, scope: 'sitewide' },
      { type: 'percent', value: 15, scope: 'sitewide' },
    ]
    expect(saleFor(product, promos)?.discountPct).toBe(15)
    expect(saleFor({ ...product, price: 0 }, promos)).toBeNull()
    expect(saleFor(product, [])).toBeNull()
    expect(saleFor(product, null)).toBeNull()
  })

  test('caps display discount at 99% and ignores junk values', () => {
    expect(saleFor(product, [{ type: 'percent', value: 150, scope: 'sitewide' }])?.discountPct).toBe(99)
    expect(saleFor(product, [{ type: 'percent', value: -5, scope: 'sitewide' }])).toBeNull()
  })
})

describe('contentPromos', () => {
  test('returns [] for null / unseeded content', () => {
    expect(contentPromos(null)).toEqual([])
    expect(contentPromos({ seeded: false })).toEqual([])
  })
})
