import { describe, it, expect } from 'vitest'
import {
  SHIPPING_FEE_PHP,
  isUuid,
  toCentavos,
  centavosToPeso,
  lineTotalCents,
  formatPesos,
  clampQuantity,
  availabilityOf,
  isPurchasableStatus,
  unavailableReason,
  effectiveSelection,
  effectiveItems,
  cartTotals,
} from './cartLogic.js'

const item = (id, price, quantity, extra = {}) => ({
  id,
  name: `Item ${id}`,
  price,
  quantity,
  image: '',
  collection: '',
  brand: '',
  ...extra,
})

describe('money', () => {
  it('converts to centavos without float drift', () => {
    expect(toCentavos(0.1) + toCentavos(0.2)).toBe(30)
    expect(toCentavos(800)).toBe(80000)
  })

  it('treats undefined / NaN / negative as 0', () => {
    expect(toCentavos(undefined)).toBe(0)
    expect(toCentavos('abc')).toBe(0)
    expect(toCentavos(-5)).toBe(-500) // sign preserved for display callers
    expect(centavosToPeso(undefined)).toBe(0)
  })

  it('multiplies price x quantity in centavos', () => {
    expect(lineTotalCents(0.1, 3)).toBe(30)
    expect(lineTotalCents(265.5, 2)).toBe(53100)
    expect(lineTotalCents(100, undefined)).toBe(0)
    expect(lineTotalCents(100, 2.9)).toBe(20000) // quantity floored
  })

  it('formats with thousands separators and never NaN', () => {
    expect(formatPesos(800)).toBe('800.00')
    expect(formatPesos(1234567.5)).toBe('1,234,567.50')
    expect(formatPesos(undefined)).toBe('0.00')
    expect(formatPesos(NaN)).toBe('0.00')
    expect(formatPesos(0)).toBe('0.00')
  })

  it('exports the flat shipping fee used by both pages', () => {
    expect(SHIPPING_FEE_PHP).toBe(75)
  })
})

describe('clampQuantity', () => {
  it('accepts integers and floors decimals', () => {
    expect(clampQuantity(3)).toBe(3)
    expect(clampQuantity('5')).toBe(5)
    expect(clampQuantity(3.9)).toBe(3)
  })

  it('rejects empty, zero, negative and non-numeric values', () => {
    expect(clampQuantity('')).toBeNull()
    expect(clampQuantity('abc')).toBeNull()
    expect(clampQuantity(0)).toBeNull()
    expect(clampQuantity(-2)).toBeNull()
    expect(clampQuantity(undefined)).toBeNull()
  })

  it('clamps to the live stock maximum', () => {
    expect(clampQuantity(50, 10)).toBe(10)
    expect(clampQuantity(10, 10)).toBe(10)
    expect(clampQuantity(1, 1)).toBe(1)
  })
})

describe('availability', () => {
  it('uses the cart snapshot before the live check resolves', () => {
    expect(availabilityOf(item('a', 100, 1), null, false).status).toBe('ok')
    expect(availabilityOf(item('a', 0, 1), null, false).status).toBe('unpriced')
  })

  it('marks deleted products once the live check resolves', () => {
    expect(availabilityOf(item('a', 100, 1), null, true).status).toBe('missing')
  })

  it('honours the live row over the snapshot', () => {
    const live = { price: 265, stock_quantity: 50, is_active: true }
    expect(availabilityOf(item('a', 0.01, 1), live, true)).toEqual({
      status: 'ok',
      price: 265,
    })
    expect(availabilityOf(item('a', 100, 1), { ...live, is_active: false }, true).status).toBe('inactive')
    expect(availabilityOf(item('a', 100, 1), { ...live, stock_quantity: 0 }, true).status).toBe('out_of_stock')
    expect(availabilityOf(item('a', 100, 1), { ...live, price: 0 }, true).status).toBe('unpriced')
  })

  it('maps statuses to user-facing copy', () => {
    expect(unavailableReason('out_of_stock')).toBe('Out of stock')
    expect(unavailableReason('unpriced')).toBe('Price not available')
    expect(unavailableReason('missing')).toBe('No longer available')
    expect(isPurchasableStatus('ok')).toBe(true)
    expect(isPurchasableStatus('out_of_stock')).toBe(false)
  })
})

describe('effectiveSelection', () => {
  const cart = [item('a', 100, 1), item('b', 200, 2), item('c', 300, 1)]

  it('keeps only ids that still exist in the cart (B1)', () => {
    expect(effectiveSelection(['a', 'ghost'], cart)).toEqual(['a'])
  })

  it('drops unavailable items when availability is known', () => {
    const availability = { a: { status: 'ok' }, b: { status: 'out_of_stock' } }
    expect(effectiveSelection(['a', 'b'], cart, availability)).toEqual(['a'])
  })

  it('keeps items whose availability has not been checked yet', () => {
    const availability = { a: { status: 'ok' } }
    expect(effectiveSelection(['a', 'b'], cart, availability)).toEqual(['a', 'b'])
  })

  it('preserves cart order', () => {
    expect(effectiveSelection(['c', 'a'], cart)).toEqual(['a', 'c'])
  })

  it('handles empty / missing inputs', () => {
    expect(effectiveSelection(null, cart)).toEqual([])
    expect(effectiveSelection(['a'], [])).toEqual([])
  })

  it('effectiveItems returns the matching cart rows', () => {
    expect(effectiveItems(['b', 'ghost'], cart).map((i) => i.id)).toEqual(['b'])
  })
})

describe('cartTotals', () => {
  const cart = [item('a', 0.1, 3), item('b', 265, 2)]

  it('sums in centavos and charges shipping once', () => {
    const t = cartTotals(cart)
    expect(t.subtotalCents).toBe(30 + 53000)
    expect(t.shippingCents).toBe(7500)
    expect(t.totalCents).toBe(53030 + 7500)
    expect(t.products).toBe(2)
    expect(t.units).toBe(5)
  })

  it('charges no shipping when nothing is selectable', () => {
    const availability = { a: { status: 'out_of_stock' }, b: { status: 'missing' } }
    const t = cartTotals(cart, availability)
    expect(t.subtotalCents).toBe(0)
    expect(t.shippingCents).toBe(0)
    expect(t.selectableProducts).toBe(0)
  })

  it('excludes unavailable rows from the subtotal but still counts them', () => {
    const availability = { b: { status: 'unpriced' } }
    const t = cartTotals(cart, availability)
    expect(t.subtotalCents).toBe(30)
    expect(t.shippingCents).toBe(7500)
    expect(t.products).toBe(2)
    expect(t.selectableProducts).toBe(1)
  })

  it('applies a custom fee from site settings (Phase 6)', () => {
    const t = cartTotals(cart, null, { fee: 99, freeThreshold: null })
    expect(t.shippingCents).toBe(9900)
    expect(t.totalCents).toBe(53030 + 9900)
  })

  it('waives shipping when the free-shipping threshold is met', () => {
    const t = cartTotals(cart, null, { fee: 75, freeThreshold: 500 })
    expect(t.subtotalCents).toBe(53030)
    expect(t.shippingCents).toBe(0)
    expect(t.totalCents).toBe(53030)
  })

  it('keeps the fee below the free-shipping threshold', () => {
    const t = cartTotals([item('a', 10, 1)], null, { fee: 75, freeThreshold: 500 })
    expect(t.subtotalCents).toBe(1000)
    expect(t.shippingCents).toBe(7500)
  })
})

describe('isUuid', () => {
  it('accepts uuids and rejects catalog ids', () => {
    expect(isUuid('da4785e9-24ca-4707-98e5-4abedb02419b')).toBe(true)
    expect(isUuid('101')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})
