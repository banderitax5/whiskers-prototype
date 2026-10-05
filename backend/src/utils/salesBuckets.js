// Period bucketing for the admin sales analytics panel.
// The paper commits to sales monitoring on a daily, weekly, monthly, and
// yearly basis, so payment rows are grouped into period buckets server-side.

const PERIOD_WINDOWS = { daily: 30, weekly: 84, monthly: 366, yearly: 1095 }

export const PERIODS = Object.keys(PERIOD_WINDOWS)

// Days of history to fetch for a period. 'daily' honors the caller's ?days
// window (clamped 1-90); the other periods use a fixed sensible window.
export function windowDays(period, requestedDays) {
  if (PERIOD_WINDOWS[period] && period !== 'daily') return PERIOD_WINDOWS[period]
  return Math.min(90, Math.max(1, Number(requestedDays) || 30))
}

// Bucket key for a single YYYY-MM-DD payment day.
// Weekly buckets back up to the Monday of that ISO week (UTC math so the
// bucket never drifts with the server timezone).
function bucketKey(day, period) {
  if (period === 'monthly') return day.slice(0, 7)
  if (period === 'yearly') return day.slice(0, 4)
  if (period === 'weekly') {
    const d = new Date(`${day}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
  }
  return day
}

// payments: [{ payment_date, amount }] -> [{ date, amount }] sorted ascending.
// Rows without a parseable date are skipped; unknown periods fall back to daily.
export function bucketPayments(payments, period) {
  const per = PERIOD_WINDOWS[period] ? period : 'daily'
  const buckets = {}
  for (const p of payments || []) {
    const day = (p.payment_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    const key = bucketKey(day, per)
    buckets[key] = (buckets[key] || 0) + Number(p.amount || 0)
  }
  return Object.entries(buckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
}
