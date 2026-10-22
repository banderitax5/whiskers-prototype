import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERIODS, periodStart, windowDays, bucketPayments } from '../src/utils/salesBuckets.js'

test('PERIODS covers the four ranges the paper requires', () => {
  assert.deepEqual(PERIODS, ['daily', 'weekly', 'monthly', 'yearly'])
})

test('periodStart anchors each period to the current date', () => {
  // 2026-10-07 is a Wednesday
  const now = new Date('2026-10-07T15:00:00Z')
  assert.equal(periodStart('daily', now), '2026-10-07')
  assert.equal(periodStart('weekly', now), '2026-10-05') // Monday of that week
  assert.equal(periodStart('monthly', now), '2026-10-01')
  assert.equal(periodStart('yearly', now), '2026-01-01')
})

test('windowDays bounds the query window per period', () => {
  assert.equal(windowDays('weekly'), 7)
  assert.equal(windowDays('monthly'), 32)
  assert.equal(windowDays('yearly'), 366)
  assert.equal(windowDays('daily', 30), 30)
  assert.equal(windowDays('daily', 500), 90)
  assert.equal(windowDays('nonsense', 45), 45)
})

test('daily buckets only today, sorted and rounded', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2026-10-01T23:59:00Z', amount: 20 }, // yesterday, excluded
    { payment_date: '2026-10-02T10:00:00Z', amount: 10.25 },
    { payment_date: '2026-10-02T15:00:00Z', amount: 5 },
  ], 'daily', now)
  assert.deepEqual(out, [{ date: '2026-10-02', amount: 15.25 }])
})

test('weekly buckets each day of the current week, excluding earlier days', () => {
  // week of Mon 2026-10-05 .. Sun 2026-10-11
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2026-10-04T08:00:00Z', amount: 99 }, // last Sunday, excluded
    { payment_date: '2026-10-05T08:00:00Z', amount: 100 },
    { payment_date: '2026-10-07T08:00:00Z', amount: 50 },
  ], 'weekly', now)
  assert.deepEqual(out, [
    { date: '2026-10-05', amount: 100 },
    { date: '2026-10-07', amount: 50 },
  ])
})

test('monthly buckets daily within the current month only', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2026-09-30T08:00:00Z', amount: 77 }, // last month, excluded
    { payment_date: '2026-10-01T08:00:00Z', amount: 10 },
    { payment_date: '2026-10-05T08:00:00Z', amount: 15 },
  ], 'monthly', now)
  assert.deepEqual(out, [
    { date: '2026-10-01', amount: 10 },
    { date: '2026-10-05', amount: 15 },
  ])
})

test('yearly buckets by month within the current year only', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = bucketPayments([
    { payment_date: '2025-12-31T08:00:00Z', amount: 500 }, // last year, excluded
    { payment_date: '2026-01-15T08:00:00Z', amount: 10 },
    { payment_date: '2026-09-01T08:00:00Z', amount: 15 },
    { payment_date: '2026-10-01T08:00:00Z', amount: 5 },
  ], 'yearly', now)
  assert.deepEqual(out, [
    { date: '2026-01', amount: 10 },
    { date: '2026-09', amount: 15 },
    { date: '2026-10', amount: 5 },
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
  assert.deepEqual(out, [{ date: '2026-10-05', amount: 7 }])
  assert.deepEqual(bucketPayments(null, 'daily', now), [])
})
