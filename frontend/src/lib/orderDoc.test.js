import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  peso,
  orderCode,
  trackingCode,
  formatOrderDate,
  formatOrderDateTime,
  formatShortDate,
  etaWindow,
  CARRIER,
  paymentMethodLabel,
  summarize,
  paymentPill,
  fulfillmentPill,
  deliveryPill,
  fetchOrderById,
} from './orderDoc'

describe('formatters', () => {
  it('formats peso amounts', () => {
    expect(peso(1234.5)).toBe('₱1,234.50')
    expect(peso(0)).toBe('₱0.00')
    expect(peso('nope')).toBe('₱0.00')
  })

  it('builds display codes', () => {
    expect(orderCode('abcdef123')).toBe('#WPS-ABCDEF')
    expect(orderCode(null)).toBe('#WPS-')
    expect(trackingCode('abcdefghij')).toBe('TRK-ABCDEFGH')
  })

  it('returns empty strings for missing dates', () => {
    expect(formatOrderDate('')).toBe('')
    expect(formatOrderDateTime('')).toBe('')
    expect(formatShortDate('')).toBe('')
    expect(etaWindow('')).toBe('')
  })

  it('formats a date and datetime', () => {
    const iso = new Date(2026, 9, 5, 14, 30).toISOString()
    expect(formatOrderDate(iso)).toBe('October 5, 2026')
    expect(formatOrderDateTime(iso)).toBe('October 5, 2026 | 02:30 PM')
    expect(formatShortDate(iso)).toBe('Oct 5, 2026')
  })

  it('builds an eta window a few days wide', () => {
    const iso = new Date(2026, 9, 5, 14, 30).toISOString()
    const [from, to] = etaWindow(iso).split(' – ')
    expect(from).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    expect(to).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    const days = (Date.parse(to) - Date.parse(from)) / 86400000
    expect(days).toBeGreaterThanOrEqual(1)
    expect(days).toBeLessThanOrEqual(3)
  })
})

describe('labels and pills', () => {
  it('exposes the carrier constant', () => {
    expect(CARRIER).toBe('Whiskers Express')
  })

  it('maps payment methods', () => {
    expect(paymentMethodLabel('cod')).toBe('COD (Cash on Delivery)')
    expect(paymentMethodLabel('GCash')).toBe('GCash')
    expect(paymentMethodLabel('other')).toBe('OTHER')
    expect(paymentMethodLabel('')).toBe('N/A')
  })

  it('derives an honest payment pill from method and payment row', () => {
    expect(paymentPill({ payment: { method: 'cod', amount: 100 } }).label).toBe('PAY ON DELIVERY')
    expect(paymentPill({ payment: { method: 'gcash', amount: 100 } }).label).toBe('PAYMENT PENDING')
    expect(paymentPill({}).label).toBe('UNPAID')
  })

  it('maps fulfillment statuses with a fallback', () => {
    expect(fulfillmentPill('Shipped').label).toBe('SHIPPED')
    expect(fulfillmentPill('Delivered').label).toBe('DELIVERED')
    expect(fulfillmentPill('Weird').label).toBe('WEIRD')
    expect(fulfillmentPill(undefined).label).toBe('UNKNOWN')
  })

  it('maps delivery statuses with a fallback', () => {
    expect(deliveryPill('Pending').label).toBe('PREPARING')
    expect(deliveryPill('Shipped').label).toBe('IN TRANSIT')
    expect(deliveryPill('Lost').label).toBe('UNKNOWN')
  })
})

describe('summarize', () => {
  it('derives subtotal, shipping, and total', () => {
    const order = {
      items: [{ subtotal: 100 }, { subtotal: 50 }],
      payment: { amount: 200 },
      total_amount: 180,
    }
    expect(summarize(order)).toEqual({ itemsSubtotal: 150, shipping: 30, total: 200, discount: 0 })
  })

  it('handles empty orders', () => {
    expect(summarize(null)).toEqual({ itemsSubtotal: 0, shipping: 0, total: 0, discount: 0 })
  })

  it('falls back to total_amount when payment is missing', () => {
    const order = { items: [{ subtotal: 80 }], total_amount: 100 }
    expect(summarize(order)).toEqual({ itemsSubtotal: 80, shipping: 20, total: 100, discount: 0 })
  })

  it('sums per-line discounts for the receipt', () => {
    const order = {
      items: [
        { subtotal: 200, quantity: 2, discount_amount: 10 },
        { subtotal: 300, quantity: 1, discount_amount: 15 },
      ],
      payment: { amount: 500 },
      total_amount: 495,
    }
    expect(summarize(order)).toEqual({ itemsSubtotal: 500, shipping: 0, total: 500, discount: 35 })
  })
})

describe('fetchOrderById', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns data.item on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ item: { id: 'o1' } }),
    }))
    await expect(fetchOrderById('o1', 'tok')).resolves.toEqual({ id: 'o1' })
  })

  it('throws an error carrying the HTTP status on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Order not found' }),
    }))
    const err = await fetchOrderById('missing', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Order not found')
    expect(err.status).toBe(404)
  })
})
