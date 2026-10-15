import { describe, it, expect } from 'vitest'
import {
  LOW_STOCK_THRESHOLD,
  normalizeProduct,
  formatPrice,
  getStockStatus,
  isPurchasable,
  toCartPayload,
} from './productDisplay.js'

describe('normalizeProduct', () => {
  it('maps API field names to UI names', () => {
    const p = normalizeProduct({ prod_id: 'abc', prod_name: 'Kibble', image_url: 'x.png', category: 'Food', brand: 'Acme', price: 10 })
    expect(p.id).toBe('abc')
    expect(p.prod_id).toBe('abc')
    expect(p.name).toBe('Kibble')
    expect(p.image).toBe('x.png')
    expect(p.collection).toBe('Food')
    expect(p.category).toBe('Food')
    expect(p.brand).toBe('Acme')
    expect(p.price).toBe(10)
  })

  it('keeps already-normalized names and coerces price to a number', () => {
    const p = normalizeProduct({ id: 'x', name: 'Toy', image: 'y.png', collection: 'Fun', price: '25.5' })
    expect(p.name).toBe('Toy')
    expect(p.image).toBe('y.png')
    expect(p.price).toBe(25.5)
  })

  it('returns null for empty input and defaults missing price to 0', () => {
    expect(normalizeProduct(null)).toBeNull()
    expect(normalizeProduct(undefined)).toBeNull()
    expect(normalizeProduct({ prod_id: 'a' }).price).toBe(0)
  })
})

describe('formatPrice', () => {
  it('formats positive numbers to two decimals', () => {
    expect(formatPrice(10)).toBe('PHP 10.00')
    expect(formatPrice('25.5')).toBe('PHP 25.50')
  })
  it('returns null for zero, negative, or invalid prices', () => {
    expect(formatPrice(0)).toBeNull()
    expect(formatPrice(-5)).toBeNull()
    expect(formatPrice('abc')).toBeNull()
    expect(formatPrice(null)).toBeNull()
  })
})

describe('getStockStatus', () => {
  it('flags out of stock at 0', () => {
    const s = getStockStatus(0)
    expect(s.inStock).toBe(false)
    expect(s.lowStock).toBe(false)
  })
  it('flags low stock at the threshold and below', () => {
    expect(getStockStatus(LOW_STOCK_THRESHOLD).lowStock).toBe(true)
    expect(getStockStatus(1).lowStock).toBe(true)
    expect(getStockStatus(LOW_STOCK_THRESHOLD + 1).lowStock).toBe(false)
  })
  it('honours an owner-configured threshold', () => {
    expect(getStockStatus(7, 7).lowStock).toBe(true)
    expect(getStockStatus(8, 7).lowStock).toBe(false)
    expect(getStockStatus(3, 0).lowStock).toBe(false)
    expect(getStockStatus(3, -1).lowStock).toBe(true) // invalid threshold falls back
    expect(getStockStatus(3, 'abc').lowStock).toBe(true)
  })
  it('flags in stock above the threshold', () => {
    const s = getStockStatus(50)
    expect(s.inStock).toBe(true)
    expect(s.lowStock).toBe(false)
  })
  it('treats missing/NaN stock as unknown but in stock', () => {
    const s = getStockStatus(undefined)
    expect(s.hasStockInfo).toBe(false)
    expect(s.inStock).toBe(true)
    expect(getStockStatus('abc').inStock).toBe(true)
  })
})

describe('isPurchasable', () => {
  it('requires a real price and stock', () => {
    expect(isPurchasable({ price: 10, stock_quantity: 5 })).toBe(true)
    expect(isPurchasable({ price: 0, stock_quantity: 5 })).toBe(false)
    expect(isPurchasable({ price: 10, stock_quantity: 0 })).toBe(false)
  })
})

describe('toCartPayload', () => {
  it('produces the same shape the modal/Menu send to addToCart', () => {
    const payload = toCartPayload({ prod_id: 'p1', prod_name: 'Kibble', price: 12, image_url: 'i.png', category: 'Food', brand: 'Acme' })
    expect(payload).toEqual({ id: 'p1', name: 'Kibble', price: 12, image: 'i.png', collection: 'Food', brand: 'Acme' })
  })
})
