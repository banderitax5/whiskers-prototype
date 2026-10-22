// Pure helpers shared by the cart and checkout pages. Everything here is
// side-effect free so the selection, availability, and money rules can be
// unit tested without React or the network.

// flat shipping fee charged once per order while it has at least one
// purchasable item. Single source of truth for Cart, Checkout, and the
// POST /api/orders body (the server re-applies its own copy of this rule).
export const SHIPPING_FEE_PHP = 75

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

// ---------------------------------------------------------------------------
// money — arithmetic in whole centavos so 0.1 + 0.2 never bites us
// ---------------------------------------------------------------------------

export function toCentavos(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function centavosToPeso(cents) {
  const c = Number(cents)
  return Number.isFinite(c) ? c / 100 : 0
}

// line total for price x quantity, computed in centavos
export function lineTotalCents(price, quantity) {
  return toCentavos(price) * Math.max(0, Math.floor(Number(quantity) || 0))
}

// safe display formatter: thousands separators, 2 decimals, never NaN
export function formatPesos(amount) {
  return centavosToPeso(toCentavos(amount)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ---------------------------------------------------------------------------
// quantity — integers only, clamped to [1, max]
// ---------------------------------------------------------------------------

// normalizes any draft/typed value into a committable integer quantity.
// Returns null when the value cannot become a valid quantity (empty field,
// letters, 0, negatives) so callers can roll the draft back.
export function clampQuantity(value, max = Infinity) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const floored = Math.floor(n)
  if (floored < 1) return null
  if (Number.isFinite(max) && max >= 1) return Math.min(floored, Math.floor(max))
  return floored
}

// ---------------------------------------------------------------------------
// availability — one rule for "can this cart row be ordered?"
// ---------------------------------------------------------------------------

// status: 'ok' | 'missing' | 'inactive' | 'out_of_stock' | 'unpriced'
// `live` is the current product row; `checked` says whether the live lookup
// has resolved for this item. Before the check resolves we fall back to the
// snapshot stored in the cart row so the UI never blocks on the network.
export function availabilityOf(item, live, checked = false) {
  if (!item) return { status: 'missing', price: 0 }
  if (!checked) {
    const price = Number(item.price) || 0
    if (!(price > 0)) return { status: 'unpriced', price }
    return { status: 'ok', price }
  }
  if (!live) return { status: 'missing', price: 0 }
  if (live.is_active === false) return { status: 'inactive', price: Number(live.price) || 0 }
  const stock = Number(live.stock_quantity)
  if (Number.isFinite(stock) && stock <= 0) return { status: 'out_of_stock', price: Number(live.price) || 0 }
  const price = Number(live.price) || 0
  if (!(price > 0)) return { status: 'unpriced', price }
  return { status: 'ok', price }
}

export function isPurchasableStatus(status) {
  return status === 'ok'
}

const STATUS_COPY = {
  missing: 'No longer available',
  inactive: 'Unavailable',
  out_of_stock: 'Out of stock',
  unpriced: 'Price not available',
}

export function unavailableReason(status) {
  return STATUS_COPY[status] || 'Unavailable'
}

// ---------------------------------------------------------------------------
// selection — effective selection = requested ids that still exist and can
// be ordered. This is what B1 was missing: stale ids are dropped everywhere.
// ---------------------------------------------------------------------------

export function effectiveSelection(selectedIds, cartItems, availabilityById = null) {
  const selected = new Set(selectedIds || [])
  const items = cartItems || []
  return items
    .filter((item) => selected.has(item.id))
    .filter((item) => {
      if (!availabilityById) return true
      const info = availabilityById[item.id]
      if (!info) return true // not checked yet — keep it selectable
      return isPurchasableStatus(info.status)
    })
    .map((item) => item.id)
}

export function effectiveItems(selectedIds, cartItems, availabilityById = null) {
  const ids = new Set(effectiveSelection(selectedIds, cartItems, availabilityById))
  return (cartItems || []).filter((item) => ids.has(item.id))
}

// ---------------------------------------------------------------------------
// totals — products (distinct rows), units (matches the navbar badge),
// subtotal/shipping/total in centavos.
// shippingOpts { fee, freeThreshold } comes from site settings when loaded
// (Phase 6); without it the built-in flat fee applies at every order size.
// ---------------------------------------------------------------------------

export function cartTotals(items, availabilityById = null, shippingOpts = null) {
  const list = items || []
  const priced = list.filter((item) => {
    if (!availabilityById) return true
    const info = availabilityById[item.id]
    if (!info) return true
    return isPurchasableStatus(info.status)
  })
  const subtotalCents = priced.reduce(
    (sum, item) => sum + lineTotalCents(item.price, item.quantity),
    0
  )
  const feeCents = toCentavos(shippingOpts?.fee ?? SHIPPING_FEE_PHP)
  const thresholdCents = shippingOpts?.freeThreshold == null ? null : toCentavos(shippingOpts.freeThreshold)
  let shippingCents = priced.length > 0 ? feeCents : 0
  if (priced.length > 0 && thresholdCents !== null && subtotalCents >= thresholdCents) {
    shippingCents = 0
  }
  return {
    products: list.length,
    units: list.reduce((sum, item) => sum + (Math.floor(Number(item.quantity) || 0)), 0),
    selectableProducts: priced.length,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
  }
}
