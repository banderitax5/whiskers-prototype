import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERIODS, windowDays, bucketPayments } from '../src/utils/salesBuckets.js'

test('PERIODS covers the four ranges the paper requires', () => {
  assert.deepEqual(PERIODS, ['daily', 'weekly', 'monthly', 'yearly'])
})

test('windowDays clamps the daily window and fixes the rest', () => {
  assert.equal(windowDays('daily', 30), 30)
  assert.equal(windowDays('daily', 0), 30)
  assert.equal(windowDays('daily', 500), 90)
  assert.equal(windowDays('daily', 0.4), 1)
  assert.equal(windowDays('weekly'), 84)
  assert.equal(windowDays('monthly'), 366)
  assert.equal(windowDays('yearly'), 1095)
  assert.equal(windowDays('nonsense', 45), 45)
})

test('daily buckets one row per calendar day, sorted, rounded', () => {
  const out = bucketPayments([
    { payment_date: '2026-10-02T10:00:00+08:00', amount: 10.25 },
    { payment_date: '2026-10-01T23:59:00+08:00', amount: 20 },
    { payment_date: '2026-10-02T15:00:00+08:00', amount: 5 },
  ], 'daily')
  assert.deepEqual(out, [
    { date: '2026-10-01', amount: 20 },
    { date: '2026-10-02', amount: 15.25 },
  ])
})

test('weekly buckets every day of the same ISO week onto its Monday', () => {
  // 2026-10-05 is a Monday; Sunday 2026-10-11 belongs to it too
  const out = bucketPayments([
    { payment_date: '2026-10-05T08:00:00Z', amount: 100 },
    { payment_date: '2026-10-11T08:00:00Z', amount: 50 },
    { payment_date: '2026-10-12T08:00:00Z', amount: 1 }, // next Monday
  ], 'weekly')
  assert.deepEqual(out, [
    { date: '2026-10-05', amount: 150 },
    { date: '2026-10-12', amount: 1 },
  ])
})

test('monthly and yearly buckets use period keys', () => {
  const rows = [
    { payment_date: '2026-01-15T08:00:00Z', amount: 10 },
    { payment_date: '2026-12-31T08:00:00Z', amount: 15 },
    { payment_date: '2027-03-01T08:00:00Z', amount: 5 },
  ]
  assert.deepEqual(bucketPayments(rows, 'monthly'), [
    { date: '2026-01', amount: 10 },
    { date: '2026-12', amount: 15 },
    { date: '2027-03', amount: 5 },
  ])
  assert.deepEqual(bucketPayments(rows, 'yearly'), [
    { date: '2026', amount: 25 },
    { date: '2027', amount: 5 },
  ])
})

test('skips rows without a parseable date and falls back on unknown periods', () => {
  const out = bucketPayments([
    { payment_date: null, amount: 10 },
    { payment_date: '', amount: 10 },
    { payment_date: 'not-a-date', amount: 10 },
    { payment_date: '2026-10-05T08:00:00Z', amount: 7 },
  ], 'hourly')
  assert.deepEqual(out, [{ date: '2026-10-05', amount: 7 }])
  assert.deepEqual(bucketPayments(null, 'daily'), [])
})
