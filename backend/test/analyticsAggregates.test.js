import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  manilaDayKey,
  referrerSource,
  buildTraffic,
  buildFunnel,
  buildDailyViews,
  buildTopPages,
  buildTopSearches,
  summarizeOrderCosting,
} from '../src/utils/analyticsAggregates.js'

const ev = (event_type, metadata = {}, extra = {}) => ({
  event_type,
  page: extra.page || '/',
  created_at: extra.created_at || '2026-10-07T12:00:00Z',
  metadata,
})

test('manilaDayKey uses Asia/Manila and rejects invalid dates', () => {
  assert.equal(manilaDayKey('2026-10-06T16:30:00Z'), '2026-10-07')
  assert.equal(manilaDayKey('2026-10-06T15:30:00Z'), '2026-10-06')
  assert.equal(manilaDayKey('not-a-date'), '')
  assert.equal(manilaDayKey(null), '')
})

test('referrerSource extracts the host and treats our own host as Direct', () => {
  assert.equal(referrerSource('https://www.google.com/search?q=pet'), 'google.com')
  assert.equal(referrerSource('https://dashboard.uptimerobot.com/'), 'dashboard.uptimerobot.com')
  assert.equal(referrerSource('https://whiskerspet.me/menu', 'whiskerspet.me'), 'Direct')
  assert.equal(referrerSource('', 'whiskerspet.me'), 'Direct')
  assert.equal(referrerSource('not a url'), 'Direct')
})

test('buildTraffic counts events when no session ids exist', () => {
  const out = buildTraffic([
    ev('page_view', { referrer: 'https://google.com/' }),
    ev('page_view', { referrer: 'https://google.com/' }),
    ev('page_view', {}),
  ], 'whiskerspet.me')
  assert.equal(out.metric, 'events')
  assert.deepEqual(out.items, [
    { name: 'google.com', count: 2 },
    { name: 'Direct', count: 1 },
  ])
})

test('buildTraffic counts unique sessions once session ids exist', () => {
  const out = buildTraffic([
    ev('page_view', { session_id: 'sess-aaaa', landing_referrer: 'https://google.com/' }),
    ev('product_view', { session_id: 'sess-aaaa', landing_referrer: 'https://google.com/' }),
    ev('page_view', { session_id: 'sess-bbbb', landing_referrer: 'https://facebook.com/' }),
    ev('page_view', { session_id: 'sess-cccc', landing_referrer: '' }),
    // legacy event without a session is ignored once sessions are present
    ev('page_view', { referrer: 'https://legacy.example/' }),
  ], 'whiskerspet.me')
  assert.equal(out.metric, 'sessions')
  assert.deepEqual(out.items, [
    { name: 'Direct', count: 1 },
    { name: 'facebook.com', count: 1 },
    { name: 'google.com', count: 1 },
  ])
})

test('buildFunnel falls back to event counts and upgrades to sessions', () => {
  const legacy = buildFunnel([
    ev('page_view'),
    ev('page_view'),
    ev('product_view'),
    ev('add_to_cart'),
    ev('checkout_complete'),
  ])
  assert.equal(legacy.metric, 'events')
  assert.deepEqual(legacy.counts, {
    page_view: 2,
    product_view: 1,
    add_to_cart: 1,
    checkout_complete: 1,
  })

  const sessions = buildFunnel([
    ev('page_view', { session_id: 'sess-aaaa' }),
    ev('page_view', { session_id: 'sess-aaaa' }),
    ev('product_view', { session_id: 'sess-aaaa' }),
    ev('add_to_cart', { session_id: 'sess-bbbb' }),
    ev('checkout_complete', { session_id: 'sess-bbbb' }),
  ])
  assert.equal(sessions.metric, 'sessions')
  assert.deepEqual(sessions.counts, {
    page_view: 1,
    product_view: 1,
    add_to_cart: 1,
    checkout_complete: 1,
  })
})

test('buildDailyViews zero-fills the requested Manila days', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const out = buildDailyViews([
    ev('page_view', {}, { created_at: '2026-10-07T10:00:00Z' }),
    ev('page_view', {}, { created_at: '2026-10-07T11:00:00Z' }),
    ev('page_view', {}, { created_at: '2026-10-05T10:00:00Z' }),
    ev('product_view', {}, { created_at: '2026-10-07T10:00:00Z' }),
  ], 3, now)
  assert.deepEqual(out, [
    { date: '2026-10-05', count: 1 },
    { date: '2026-10-06', count: 0 },
    { date: '2026-10-07', count: 2 },
  ])
})

test('buildTopPages and buildTopSearches rank their own event types', () => {
  const events = [
    ev('page_view', {}, { page: '/menu' }),
    ev('page_view', {}, { page: '/menu' }),
    ev('page_view', {}, { page: '/' }),
    ev('search', { query: 'Dog Food' }),
    ev('search', { query: 'dog food' }),
    ev('search', { query: 'x' }),
  ]
  assert.deepEqual(buildTopPages(events), [
    { name: '/menu', count: 2 },
    { name: '/', count: 1 },
  ])
  assert.deepEqual(buildTopSearches(events), [{ query: 'dog food', count: 2 }])
})

test('summarizeOrderCosting reports margin and coverage', () => {
  const out = summarizeOrderCosting([
    { quantity: 2, unit_cost: 5, unit_price: 10, subtotal: 20, discount_amount: 0 },
    { quantity: 1, unit_cost: 2, unit_price: 10, subtotal: 10, discount_amount: 3 },
    { quantity: 1, unit_cost: null, unit_price: 10, subtotal: 10, discount_amount: 0 },
  ])
  assert.equal(out.lines, 3)
  assert.equal(out.knownLines, 2)
  assert.equal(out.coverage, 2 / 3)
  assert.equal(out.margin, 15) // (20 - 10) + (10 - 3 - 2)
})
