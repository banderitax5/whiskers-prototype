// Pure aggregation helpers for the admin analytics dashboard.
// Kept dependency-free so the route stays thin and the rules are unit-tested.

const MANILA_TZ = 'Asia/Manila'

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// YYYY-MM-DD in the shop's timezone (Asia/Manila). UTC day keys made late
// evening orders appear on the wrong day, which skewed every daily chart.
export function manilaDayKey(value) {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (!d || Number.isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(d).map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function eventSessionId(event) {
  const raw = event?.metadata?.session_id
  return typeof raw === 'string' && raw.length >= 8 ? raw : ''
}

function eventReferrer(event) {
  return event?.metadata?.landing_referrer || event?.metadata?.referrer || ''
}

// Referrer hostname, or Direct when there is no usable external referrer.
// Our own host is treated as Direct so internal navigation is not reported as
// an acquisition channel.
export function referrerSource(referrer, currentHost = '') {
  if (!referrer || typeof referrer !== 'string') return 'Direct'
  let host
  try {
    host = new URL(referrer).hostname
  } catch {
    return 'Direct'
  }
  host = host.replace(/^www\./i, '').toLowerCase()
  if (!host) return 'Direct'
  const own = String(currentHost || '').split(':')[0].replace(/^www\./i, '').toLowerCase()
  if (own && host === own) return 'Direct'
  return host
}

export function buildTraffic(events, currentHost = '') {
  const list = Array.isArray(events) ? events : []
  const hasSessions = list.some((e) => eventSessionId(e))
  const buckets = new Map()

  for (const e of list) {
    const sessionId = eventSessionId(e)
    if (hasSessions && !sessionId) continue
    const name = referrerSource(eventReferrer(e), currentHost)
    if (!buckets.has(name)) buckets.set(name, hasSessions ? new Set() : 0)
    if (hasSessions) buckets.get(name).add(sessionId)
    else buckets.set(name, buckets.get(name) + 1)
  }

  const items = [...buckets.entries()]
    .map(([name, value]) => ({ name, count: hasSessions ? value.size : value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { items, metric: hasSessions ? 'sessions' : 'events' }
}

const FUNNEL_STEPS = ['page_view', 'product_view', 'add_to_cart', 'checkout_complete']

export function buildFunnel(events) {
  const list = Array.isArray(events) ? events : []
  const hasSessions = list.some((e) => eventSessionId(e))
  const counts = Object.fromEntries(FUNNEL_STEPS.map((step) => [step, 0]))

  if (hasSessions) {
    const sets = Object.fromEntries(FUNNEL_STEPS.map((step) => [step, new Set()]))
    for (const e of list) {
      const step = e.event_type
      const sessionId = eventSessionId(e)
      if (!sessionId || !sets[step]) continue
      sets[step].add(sessionId)
    }
    for (const step of FUNNEL_STEPS) counts[step] = sets[step].size
  } else {
    for (const e of list) {
      if (counts[e.event_type] !== undefined) counts[e.event_type]++
    }
  }

  return { counts, metric: hasSessions ? 'sessions' : 'events' }
}

// Zero-filled daily page views, newest last, in Manila days.
export function buildDailyViews(events, days = 30, now = new Date()) {
  const total = Math.max(1, Math.min(90, Number(days) || 30))
  const list = Array.isArray(events) ? events : []
  const counts = new Map()

  for (const e of list) {
    if (e.event_type !== 'page_view') continue
    const day = manilaDayKey(e.created_at)
    if (!day) continue
    counts.set(day, (counts.get(day) || 0) + 1)
  }

  const keys = []
  for (let i = total - 1; i >= 0; i--) {
    keys.push(manilaDayKey(new Date(now.getTime() - i * 86400000)))
  }

  return keys.map((date) => ({ date, count: counts.get(date) || 0 }))
}

export function buildTopPages(events, limit = 10) {
  const counts = new Map()
  for (const e of Array.isArray(events) ? events : []) {
    if (e.event_type !== 'page_view' || !e.page) continue
    counts.set(e.page, (counts.get(e.page) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

export function buildTopSearches(events, limit = 10) {
  const counts = new Map()
  for (const e of Array.isArray(events) ? events : []) {
    if (e.event_type !== 'search') continue
    const query = String(e.metadata?.query || '').trim().toLowerCase()
    if (query.length < 2) continue
    counts.set(query, (counts.get(query) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([query, count]) => ({ query, count }))
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

// Known-cost margin from the M3 line snapshots. Cost can be null for legacy
// or unpriced products, so coverage is returned alongside the amount.
export function summarizeOrderCosting(lines) {
  const list = Array.isArray(lines) ? lines : []
  let knownLines = 0
  let margin = 0

  for (const line of list) {
    if (line?.unit_cost == null) continue
    knownLines++
    const quantity = Number(line.quantity || 0)
    const revenue = Number(line.subtotal || 0) || Number(line.unit_price || 0) * quantity
    const discount = Number(line.discount_amount || 0)
    margin += revenue - discount - Number(line.unit_cost) * quantity
  }

  return {
    lines: list.length,
    knownLines,
    coverage: list.length ? knownLines / list.length : 0,
    margin: round2(margin),
  }
}
