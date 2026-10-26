// Pure presentation helpers for the admin analytics dashboard.

export const FUNNEL_DEFS = [
  { key: 'page_view', label: 'Page views' },
  { key: 'product_view', label: 'Product views' },
  { key: 'add_to_cart', label: 'Add to cart' },
  { key: 'checkout_complete', label: 'Orders' },
]

export const STATUS_TONES = {
  Pending: 'warning',
  Processing: 'info',
  Shipped: 'info',
  Delivered: 'success',
  Cancelled: 'danger',
}

const STATUS_ORDER = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']

export function pct(part, whole) {
  const p = Number(part)
  const w = Number(whole)
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return null
  return (p / w) * 100
}

export function formatPct(value, digits = 1) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function deltaPct(current, previous) {
  const c = Number(current)
  const p = Number(previous)
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null
  return ((c - p) / p) * 100
}

export function compactPesos(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return 'PHP 0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `PHP ${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `PHP ${(n / 1_000).toFixed(1)}k`
  return `PHP ${Math.round(n)}`
}

export function funnelSteps(funnel) {
  const counts = FUNNEL_DEFS.map((step) => Math.max(0, Number(funnel?.[step.key] || 0)))
  const max = Math.max(...counts, 1)
  const first = counts[0] || 0

  return FUNNEL_DEFS.map((step, index) => {
    const count = counts[index]
    const previous = index > 0 ? counts[index - 1] : null
    const rate = previous ? (count / previous) * 100 : null
    return {
      ...step,
      count,
      width: (count / max) * 100,
      rate,
      dropoff: rate == null ? null : 100 - rate,
      overall: first ? (count / first) * 100 : null,
    }
  })
}

export function orderStatusRows(statusCounts) {
  const map = Object.fromEntries(
    (Array.isArray(statusCounts) ? statusCounts : []).map((row) => [row.status, Number(row.count || 0)])
  )
  const names = [
    ...STATUS_ORDER.filter((name) => map[name] !== undefined),
    ...Object.keys(map).filter((name) => !STATUS_ORDER.includes(name)),
  ]
  const total = names.reduce((sum, name) => sum + (map[name] || 0), 0)

  return names.map((name) => ({
    name,
    count: map[name] || 0,
    pct: total ? ((map[name] || 0) / total) * 100 : 0,
    tone: STATUS_TONES[name] || 'neutral',
  }))
}

// Axis / tooltip label for a bucket key: YYYY-MM-DD, YYYY-MM, or YYYY.
export function bucketLabel(key, period) {
  if (!key) return ''
  if (period === 'yearly') return String(key)
  if (period === 'monthly') {
    const [year, month] = String(key).split('-')
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const date = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return String(key)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
