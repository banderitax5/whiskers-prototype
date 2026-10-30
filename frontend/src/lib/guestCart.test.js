import { describe, test, expect, beforeEach } from 'vitest'
import {
  GUEST_CART_KEY,
  readGuestCart,
  writeGuestCart,
  clearGuestCart,
  addCartLine,
  sanitizeCartLine,
  cartUnitCount,
} from './guestCart'

// minimal in-memory Storage so the rules can be tested without a browser
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    get size() { return map.size },
    raw: map,
  }
}

const product = (over = {}) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Alpha Pro 10kg',
  price: 800,
  image: '/img/a.png',
  collection: 'Dogs',
  brand: 'Royal Canin',
  ...over,
})

let store
beforeEach(() => { store = fakeStorage() })

describe('guest cart storage', () => {
  test('round-trips the fields the cart UI needs', () => {
    writeGuestCart([{ ...product(), quantity: 2 }], store)
    expect(readGuestCart(store)).toEqual([
      {
        id: product().id,
        name: 'Alpha Pro 10kg',
        price: 800,
        image: '/img/a.png',
        collection: 'Dogs',
        brand: 'Royal Canin',
        quantity: 2,
      },
    ])
  })

  test('an empty or missing cart reads as an empty list', () => {
    expect(readGuestCart(store)).toEqual([])
    expect(readGuestCart(fakeStorage({ [GUEST_CART_KEY]: 'not json' }))).toEqual([])
    expect(readGuestCart(fakeStorage({ [GUEST_CART_KEY]: '{"a":1}' }))).toEqual([])
  })

  test('drops junk lines and duplicate ids instead of rendering them', () => {
    writeGuestCart(
      [
        { id: 'a', quantity: 1, name: 'Keep' },
        { id: 'a', quantity: 5, name: 'Duplicate' },
        { id: '', quantity: 1 },
        { quantity: 3 },
        { id: 'b', quantity: 0 },
        { id: 'c', quantity: -2 },
        { id: 'd', quantity: 'abc' },
        null,
        'nope',
      ],
      store
    )
    const lines = readGuestCart(store)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ id: 'a', name: 'Keep', quantity: 1 })
  })

  test('clamps quantity and coerces a missing price to zero', () => {
    writeGuestCart([{ id: 'a', quantity: 5000, price: 'free' }], store)
    expect(readGuestCart(store)[0]).toMatchObject({ quantity: 999, price: 0 })
    expect(sanitizeCartLine({ id: 'a', quantity: 2.9, price: -4 })).toMatchObject({
      quantity: 2,
      price: 0,
    })
  })

  test('clearing removes the key entirely', () => {
    writeGuestCart([{ ...product(), quantity: 1 }], store)
    clearGuestCart(store)
    expect(store.getItem(GUEST_CART_KEY)).toBeNull()
    expect(readGuestCart(store)).toEqual([])
  })

  test('a storage that throws never breaks the caller', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(readGuestCart(broken)).toEqual([])
    expect(writeGuestCart([{ ...product(), quantity: 1 }], broken)).toBe(false)
    expect(() => clearGuestCart(broken)).not.toThrow()
  })
})

describe('addCartLine', () => {
  test('adds a new line with a sanitized snapshot', () => {
    const next = addCartLine([], product(), 3)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: product().id, quantity: 3, price: 800 })
  })

  test('merges into the existing line instead of duplicating it', () => {
    const first = addCartLine([], product(), 1)
    const second = addCartLine(first, product(), 2)
    expect(second).toHaveLength(1)
    expect(second[0].quantity).toBe(3)
  })

  test('floors fractional quantities and never goes below one', () => {
    expect(addCartLine([], product(), 2.7)[0].quantity).toBe(2)
    expect(addCartLine([], product(), 0)[0].quantity).toBe(1)
    expect(addCartLine([], product(), 'junk')[0].quantity).toBe(1)
  })

  test('ignores a product without an id', () => {
    expect(addCartLine([], { name: 'No id' }, 1)).toEqual([])
  })
})

describe('cartUnitCount', () => {
  test('sums units, not lines', () => {
    expect(cartUnitCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5)
    expect(cartUnitCount([])).toBe(0)
    expect(cartUnitCount(null)).toBe(0)
  })
})
