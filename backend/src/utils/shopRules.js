// store-wide shop rules shared by the cart and order routes.
// The frontend mirrors SHIPPING_FEE_PHP in lib/cartLogic.js, but the server
// copy is authoritative: POST /api/orders ignores any client-sent shippingFee.

// flat fee charged once per order while it contains at least one purchasable
// item. NOTE: the real business rule (flat vs threshold vs per-item) is still
// pending owner sign-off; this matches the de-facto behavior of the app.
export const SHIPPING_FEE_PHP = 75

// upper bound for a single cart line quantity; the real limit is always the
// product's live stock, this only stops nonsense inputs like 1e9
export const MAX_LINE_QUANTITY = 999

// whole positive units only
export function normalizeQuantity(value, max = MAX_LINE_QUANTITY) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, max)
}
