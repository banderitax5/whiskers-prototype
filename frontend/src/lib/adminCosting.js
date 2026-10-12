// margin math for the admin product table (Phase 2 costings).
// percent is rounded to 1 decimal; price <= 0 means "no selling price yet",
// so a margin percentage would be meaningless.

export function marginInfo(price, cost) {
  if (cost === null || cost === undefined || cost === '') {
    return { available: false, percent: null, negative: false }
  }
  const c = Number(cost)
  const p = Number(price)
  if (!Number.isFinite(c)) return { available: false, percent: null, negative: false }
  if (!Number.isFinite(p) || p <= 0) {
    return { available: true, percent: null, negative: false }
  }
  const percent = ((p - c) / p) * 100
  return {
    available: true,
    percent: Math.round(percent * 10) / 10,
    negative: percent < 0,
  }
}

// label for the margin cell: '—' when there is nothing meaningful to show
export function formatMargin(price, cost) {
  const info = marginInfo(price, cost)
  if (!info.available || info.percent === null) return '—'
  return `${info.percent}%`
}
