// Rolling revenue buckets for the admin analytics panel.
// The paper requires daily/weekly/monthly/yearly monitoring, so each period is
// a rolling window ending today rather than a single current bucket:
//   daily   = last 30 days       (daily buckets)
//   weekly  = last 12 weeks      (weekly buckets, Monday start)
//   monthly = last 12 months     (monthly buckets)
//   yearly  = last 5 years       (yearly buckets)
// Buckets are zero-filled so bars stay calendar-aligned and quiet days do not
// collapse the spacing.

import { manilaDayKey } from './analyticsAggregates.js'

export const PERIODS = ['daily', 'weekly', 'monthly', 'yearly']

export const PERIOD_LABELS = {
  daily: '30D',
  weekly: '12W',
  monthly: '12M',
  yearly: '5Y',
}

const DAY_MS = 86400000

function utcDate(dayKey) {
  return new Date(`${dayKey}T00:00:00Z`)
}

function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + amount)
  return next
}

function mondayOf(dayKey) {
  const date = utcDate(dayKey)
  const offset = (date.getUTCDay() + 6) % 7
  return addDays(date, -offset)
}

function monthKey(dayKey) {
  return dayKey.slice(0, 7)
}

function yearKey(dayKey) {
  return dayKey.slice(0, 4)
}

// Shift a YYYY-MM key by whole months without Date overflow. Going back 12
// months from February 2024 must land on February 2023, not 1 March 2023
// (which is what setUTCMonth() does with a 29 February date).
function shiftMonthKey(key, delta) {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

// Days of history to fetch so the current rolling window is fully covered.
export function windowDays(period, requestedDays) {
  if (period === 'weekly') return 12 * 7 + 7
  if (period === 'monthly') return 366
  if (period === 'yearly') return 5 * 366
  const requested = Number(requestedDays)
  return Number.isFinite(requested)
    ? Math.min(90, Math.max(1, Math.floor(requested)))
    : 30
}

function bucketKeys(period, now) {
  const today = manilaDayKey(now)
  if (!today) return []

  if (period === 'weekly') {
    const thisMonday = mondayOf(today)
    return Array.from({ length: 12 }, (_, i) => isoDay(addDays(thisMonday, -(11 - i) * 7)))
  }

  if (period === 'monthly') {
    const date = utcDate(today)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(year, month - (11 - i), 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
  }

  if (period === 'yearly') {
    const year = utcDate(today).getUTCFullYear()
    return Array.from({ length: 5 }, (_, i) => String(year - (4 - i)))
  }

  const end = utcDate(today)
  return Array.from({ length: 30 }, (_, i) => isoDay(addDays(end, -(29 - i))))
}

// payments: [{ payment_date, amount }] -> [{ date, amount }] ascending.
// Unknown periods fall back to the daily window; unparseable dates are skipped.
export function bucketPayments(payments, period, now = new Date()) {
  const per = PERIODS.includes(period) ? period : 'daily'
  const keys = bucketKeys(per, now)
  const buckets = new Map(keys.map((key) => [key, 0]))

  for (const payment of Array.isArray(payments) ? payments : []) {
    const day = manilaDayKey(payment?.payment_date)
    if (!day) continue

    let key = day
    if (per === 'weekly') key = isoDay(mondayOf(day))
    else if (per === 'monthly') key = monthKey(day)
    else if (per === 'yearly') key = yearKey(day)

    if (!buckets.has(key)) continue
    buckets.set(key, buckets.get(key) + Number(payment.amount || 0))
  }

  return [...buckets.entries()].map(([date, amount]) => ({
    date,
    amount: Math.round(amount * 100) / 100,
  }))
}

function windowSpanDays(period) {
  if (period === 'weekly') return 84
  if (period === 'monthly') return 365
  if (period === 'yearly') return 1825
  return 30
}

// First instant of the current rolling window, in Asia/Manila. The route uses
// this so the KPI totals, method split, and chart buckets all cover exactly the
// same rows.
export function windowStart(period, now = new Date()) {
  const per = PERIODS.includes(period) ? period : 'daily'
  const keys = bucketKeys(per, now)
  if (!keys.length) return new Date(now)
  const first = keys[0]
  if (per === 'monthly') return new Date(`${first}-01T00:00:00+08:00`)
  if (per === 'yearly') return new Date(`${first}-01-01T00:00:00+08:00`)
  return new Date(`${first}T00:00:00+08:00`)
}

// Previous window of the same length, used for the "vs previous" deltas.
// Monthly/yearly must step by calendar units rather than a fixed day count so
// leap years and 28/30/31-day months do not shift the comparison boundary.
export function previousWindowStart(period, now = new Date()) {
  const per = PERIODS.includes(period) ? period : 'daily'
  const keys = bucketKeys(per, now)

  if (per === 'monthly') {
    if (!keys.length) return new Date(now)
    return new Date(`${shiftMonthKey(keys[0], -12)}-01T00:00:00+08:00`)
  }
  if (per === 'yearly') {
    if (!keys.length) return new Date(now)
    return new Date(`${Number(keys[0]) - 5}-01-01T00:00:00+08:00`)
  }

  return new Date(windowStart(per, now).getTime() - windowSpanDays(per) * DAY_MS)
}
