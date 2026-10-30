// Guest cart storage.
//
// A visitor who has not signed in still gets a working cart: the lines live in
// localStorage and are merged into their account the moment they sign in (see
// ShopContext). Everything here is pure and takes an optional Storage so the
// rules can be unit tested without a browser.
//
// Only the fields the cart UI needs are kept. The server never trusts these
// values: on sign-in each line is re-posted as { productId, quantity } and
// POST /api/cart recomputes name/price/image/stock from the product table.

export const GUEST_CART_KEY = 'whiskers_guest_cart_v1'

// A cart that cannot be read is treated as empty, so a corrupt or full storage
// never breaks browsing. These caps keep a runaway script from filling the
// quota and are generous for a real shopper.
const MAX_LINES = 100
const MAX_QUANTITY = 999
const MAX_TEXT = 200
const MAX_URL = 2000

function text(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

// normalizes one stored line; returns null when it cannot describe a cart row
export function sanitizeCartLine(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  const quantity = Math.floor(Number(raw.quantity))
  if (!Number.isFinite(quantity) || quantity < 1) return null
  const price = Number(raw.price)
  return {
    id: id.slice(0, 64),
    name: text(raw.name),
    price: Number.isFinite(price) && price > 0 ? price : 0,
    image: text(raw.image, MAX_URL),
    collection: text(raw.collection),
    brand: text(raw.brand),
    quantity: Math.min(quantity, MAX_QUANTITY),
  }
}

// safe access to localStorage: private-mode browsers and SSR have none
function storageOf(storage) {
  if (storage) return storage
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readGuestCart(storage) {
  const store = storageOf(storage)
  if (!store) return []
  let parsed
  try {
    parsed = JSON.parse(store.getItem(GUEST_CART_KEY) || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const lines = []
  const seen = new Set()
  for (const raw of parsed) {
    const line = sanitizeCartLine(raw)
    // a duplicated id would render twice and double-count in the totals
    if (!line || seen.has(line.id)) continue
    seen.add(line.id)
    lines.push(line)
    if (lines.length >= MAX_LINES) break
  }
  return lines
}

export function writeGuestCart(items, storage) {
  const store = storageOf(storage)
  if (!store) return false
  const lines = (Array.isArray(items) ? items : [])
    .map(sanitizeCartLine)
    .filter(Boolean)
    .slice(0, MAX_LINES)
  try {
    // an empty cart removes the key instead of storing "[]", so a signed-out
    // browser never keeps a leftover cart around
    if (lines.length === 0) store.removeItem(GUEST_CART_KEY)
    else store.setItem(GUEST_CART_KEY, JSON.stringify(lines))
    return true
  } catch {
    // quota exceeded / storage disabled: the in-memory cart still works
    return false
  }
}

export function clearGuestCart(storage) {
  const store = storageOf(storage)
  if (!store) return
  try {
    store.removeItem(GUEST_CART_KEY)
  } catch {
    /* nothing to do */
  }
}

// Adds a product to a cart array, merging with an existing line. Shared by the
// guest path and the signed-in optimistic update so both behave identically.
export function addCartLine(items, product, quantity = 1) {
  const list = Array.isArray(items) ? items : []
  const id = product?.id
  if (!id) return list
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const existing = list.find((item) => item.id === id)
  if (existing) {
    return list.map((item) =>
      item.id === id
        ? { ...item, quantity: Math.min(item.quantity + qty, MAX_QUANTITY) }
        : item
    )
  }
  const line = sanitizeCartLine({
    id,
    name: product.name,
    price: product.price,
    image: product.image,
    collection: product.collection,
    brand: product.brand,
    quantity: qty,
  })
  return line ? [...list, line] : list
}

// How many units a cart array holds - used for the merge summary toast.
export function cartUnitCount(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + Math.max(0, Math.floor(Number(item.quantity) || 0)),
    0
  )
}
