// Period bucketing for the admin sales analytics panel.
// The paper commits to sales monitoring on a daily, weekly, monthly, and
// yearly basis. Each period shows the CURRENT period so far:
//   daily   = today            (1 daily bucket)
//   weekly  = this week (Mon+) (up to 7 daily buckets)
//   monthly = this month       (up to ~31 daily buckets)
//   yearly  = this year        (up to 12 monthly buckets)

export const PERIODS = ['daily', 'weekly', 'monthly', 'yearly']

function utcDate(d) {
  return new Date(`${d}T00:00:00Z`)
}

// Start day (YYYY-MM-DD, UTC) of the current period containing `now`.
export function periodStart(period, now = new Date()) {
  const d = new Date(now)
  const iso = (x) => x.toISOString().slice(0, 10)
  if (period === 'weekly') {
    // back up to Monday of the ISO week
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return iso(d)
  }
  if (period === 'monthly') {
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
  }
  if (period === 'yearly') {
    return iso(new Date(Date.UTC(d.getUTCFullYear(), 0, 1)))
  }
  // daily (and unknown periods) start today
  return iso(d)
}

// Days of history the caller should fetch to cover the current period.
// Used only to bound the upstream query window.
export function windowDays(period, requestedDays) {
  if (period === 'weekly') return 7
  if (period === 'monthly') return 32
  if (period === 'yearly') return 366
  return Math.min(90, Math.max(1, Number(requestedDays) || 30))
}

// Bucket key for a single YYYY-MM-DD payment day.
// yearly buckets collapse to the month; everything else buckets per day
// so the intra-period trend stays visible.
function bucketKey(day, period) {
  if (period === 'yearly') return day.slice(0, 7)
  return day
}

// payments: [{ payment_date, amount }] -> [{ date, amount }] sorted ascending.
// Only rows on/after the current period start are kept, so the chart shows
// the period so far rather than a rolling multi-period window.
// Rows without a parseable date are skipped; unknown periods fall back to daily.
export function bucketPayments(payments, period, now = new Date()) {
  const per = PERIODS.includes(period) ? period : 'daily'
  const start = periodStart(per, now)
  const buckets = {}
  for (const p of payments || []) {
    const day = (p.payment_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    if (day < start) continue
    const key = bucketKey(day, per)
    buckets[key] = (buckets[key] || 0) + Number(p.amount || 0)
  }
  return Object.entries(buckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
}
