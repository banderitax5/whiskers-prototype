// Order-line costing math. The SQL function public.effective_price() in
// migration 2026-10-13_order_costings_snapshots.sql is the canonical
// definition; this module mirrors it for API shaping, and the Phase 3 E2E
// asserts both agree on the same row. Keep the two in lockstep.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// Per-unit sale price after line discounts. Prefer the unit_price snapshot
// taken at checkout; fall back to subtotal / quantity for rows written
// before M3 (exact for every historical row - subtotal was price * qty).
export function effectiveUnitPrice(line) {
  const qty = Number(line?.quantity) || 0
  if (qty <= 0) return 0
  const snapshot = line?.unit_price != null ? Number(line.unit_price) * qty : null
  const revenue = snapshot ?? Number(line?.subtotal || 0)
  const afterDiscount = revenue - Number(line?.discount_amount || 0)
  return round2(afterDiscount / qty)
}

// Total cost of the line. Unknown (null unit_cost) stays unknown - never
// substitute a guess, reports must be able to say "not tracked".
export function lineCost(line) {
  const qty = Number(line?.quantity) || 0
  if (line?.unit_cost == null || qty <= 0) return null
  return round2(Number(line.unit_cost) * qty)
}

// line revenue minus line cost; null when cost was never recorded.
// can legitimately be negative (sold below cost) - callers render, not clamp.
export function lineMargin(line) {
  const cost = lineCost(line)
  if (cost == null) return null
  const qty = Number(line?.quantity) || 0
  const snapshot = line?.unit_price != null ? Number(line.unit_price) * qty : null
  const revenue = (snapshot ?? Number(line?.subtotal || 0)) - Number(line?.discount_amount || 0)
  return round2(revenue - cost)
}
