import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PERIODS,
  PERIOD_LABELS,
  windowDays,
  windowStart,
  previousWindowStart,
  bucketPayments,
} from '../src/utils/salesBuckets.js'

test('PERIODS covers the four ranges the paper requires', () => {
  assert.deepEqual(PERIODS, ['daily', 'weekly', 'monthly', 'yearly'])
  assert.deepEqual(PERIOD_LABELS, { daily: '30D', weekly: '12W', monthly: '12M', yearly: '5Y' })
})

test('windowDays bounds the query window per period', () => {
  assert.equal(windowDays('weekly'), 91)
  assert.equal(windowDays('monthly'), 366)
  assert.equal(windowDays('yearly'), 1830)
  assert.equal(windowDays('daily'), 30)
  assert.equal(windowDays('daily', 45), 45)
  assert.equal(windowDays('daily', 500), 90)
  assert.equal(windowDays('nonsense', 45), 45)
})

test('windowStart anchors the rolling window in Manila time', () => {
  const now = new Date('2026-10-07T15:00:00Z') // 2026-10-07 23:00 Manila
  assert.equal(windowStart('daily', now).toISOString(), '2026-09-07T16:00:00.000Z')
  assert.equal(windowStart('weekly', now).toISOString(), '2026-07-19T16:00:00.000Z')
  assert.equal(windowStart('monthly', now).toISOString(), '2025-10-31T16:00:00.000Z')
  assert.equal(windowStart('yearly', now).toISOString(), '2021-12-31T16:00:00.000Z')
})

test('previousWindowStart is one full window before the current start', () => {
  const now = new Date('2026-10-07T15:00:00Z')
  assert.equal(previousWindowStart('daily', now).toISOString(), '2026-08-08T16:00:00.000Z')
  assert.equal(previousWindowStart('weekly', now).toISOString(), '2026-04-26T16:00:00.000Z')
  assert.equal(previousWindowStart('monthly', now).toISOString(), '2024-10-31T16:00:00.000Z')
  assert.equal(previousWindowStart('yearly', now).toISOString(), '2016-12-31T16:00:00.000Z')
})

test('previousWindowStart does not overflow the leap day', () => {
  // The current 12-month window starts 1 March 2024, whose Manila midnight is
  // 29 February 2024 16:00 UTC. The previous window must start 1 March 2023,
  // not 2 March 2023.
  const now = new Date('2025-02-15T12:00:00Z')
  assert.equal(windowStart('monthly', now).toISOString(), '2024-02-29T16:00:00.000Z')
  assert.equal(previousWindowStart('monthly', now).toISOString(), '2023-02-28T16:00:00.000Z')
})

test('daily buckets zero-fill the last 30 Manila days', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2026-09-07T10:00:00Z', amount: 99 }, // outside the 30-day window
    { payment_date: '2026-10-06T10:00:00Z', amount: 20.25 },
    { payment_date: '2026-10-07T10:00:00Z', amount: 5 },
  ], 'daily', now)

  assert.equal(out.length, 30)
  assert.equal(out[0].date, '2026-09-08')
  assert.equal(out.at(-1).date, '2026-10-07')
  assert.equal(out.at(-1).amount, 5)
  assert.equal(out.at(-2).amount, 20.25)
  assert.equal(out.reduce((sum, row) => sum + row.amount, 0), 25.25)
})

test('daily buckets use the Manila day, not the UTC day', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2026-10-06T16:30:00Z', amount: 7 }, // 2026-10-07 00:30 Manila
  ], 'daily', now)
  assert.equal(out.at(-1).date, '2026-10-07')
  assert.equal(out.at(-1).amount, 7)
})

test('weekly buckets zero-fill 12 Monday-start weeks', () => {
  const now = new Date('2026-10-07T12:00:00Z') // Wednesday
  const out = bucketPayments([
    { payment_date: '2026-07-19T08:00:00Z', amount: 99 }, // Sunday, week of Jul 13, outside
    { payment_date: '2026-07-20T08:00:00Z', amount: 100 }, // first included Monday
    { payment_date: '2026-10-04T08:00:00Z', amount: 50 }, // Sunday, week of Sep 28
    { payment_date: '2026-10-05T08:00:00Z', amount: 25 }, // current Monday
  ], 'weekly', now)

  assert.equal(out.length, 12)
  assert.equal(out[0].date, '2026-07-20')
  assert.equal(out[0].amount, 100)
  assert.equal(out.at(-1).date, '2026-10-05')
  assert.equal(out.at(-1).amount, 25)
  assert.equal(out.at(-2).date, '2026-09-28')
  assert.equal(out.at(-2).amount, 50)
})

test('monthly buckets zero-fill 12 calendar months', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2025-10-31T08:00:00Z', amount: 99 }, // October 2025, outside
    { payment_date: '2025-11-01T08:00:00Z', amount: 10 },
    { payment_date: '2026-09-30T08:00:00Z', amount: 15 },
    { payment_date: '2026-10-01T08:00:00Z', amount: 5 },
  ], 'monthly', now)

  assert.equal(out.length, 12)
  assert.equal(out[0].date, '2025-11')
  assert.equal(out[0].amount, 10)
  assert.equal(out.at(-2).date, '2026-09')
  assert.equal(out.at(-2).amount, 15)
  assert.equal(out.at(-1).date, '2026-10')
  assert.equal(out.at(-1).amount, 5)
})

test('yearly buckets zero-fill five calendar years', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2021-12-31T08:00:00Z', amount: 500 }, // outside
    { payment_date: '2022-01-15T08:00:00Z', amount: 10 },
    { payment_date: '2026-10-01T08:00:00Z', amount: 5 },
  ], 'yearly', now)

  assert.deepEqual(out, [
    { date: '2022', amount: 10 },
    { date: '2023', amount: 0 },
    { date: '2024', amount: 0 },
    { date: '2025', amount: 0 },
    { date: '2026', amount: 5 },
  ])
})

test('skips rows without a parseable date and falls back on unknown periods', () => {
  const now = new Date('2026-10-05T12:00:00Z')
  const out = bucketPayments([
    { payment_date: null, amount: 10 },
    { payment_date: '', amount: 10 },
    { payment_date: 'not-a-date', amount: 10 },
    { payment_date: '2026-10-05T08:00:00Z', amount: 7 },
  ], 'hourly', now)
  assert.equal(out.length, 30)
  assert.equal(out.at(-1).date, '2026-10-05')
  assert.equal(out.at(-1).amount, 7)

  const empty = bucketPayments(null, 'daily', now)
  assert.equal(empty.length, 30)
  assert.ok(empty.every((row) => row.amount === 0))
})
