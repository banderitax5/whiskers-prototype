// View-layer helpers for the Audit Logs page: Manila-time day grouping,
// client-side filters over the already-loaded rows, CSV export, and the
// target resolver that turns uuids into readable names. Pure functions take
// an injectable `now` so tests are deterministic.

import { apiGet, apiGetAllPages } from './api'
import { formatPesos } from './cartLogic'
import { humanizeField } from './auditRegistry'

const MANILA = 'Asia/Manila'

function manilaFormatter(opts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: MANILA, ...opts })
}

// YYYY-MM-DD in Manila time (the shop's timezone; Oracle VMs default to UTC)
export function dayKey(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function dayLabel(key, now = new Date()) {
  if (!key || key === 'unknown') return 'Unknown date'
  const today = dayKey(now, now)
  if (key === today) return 'Today'
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === dayKey(yesterdayDate, yesterdayDate)) return 'Yesterday'
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return key
  const date = new Date(Date.UTC(y, m - 1, d))
  const sameYear = manilaFormatter({ year: 'numeric' }).format(now) === String(y)
  return manilaFormatter({ month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(date)
}

// "11 minutes ago" for the last 24 hours, otherwise null (exact time shown)
export function relativeLabel(ts, now = new Date()) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const diff = now.getTime() - d.getTime()
  if (diff < 0) return 'just now'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return null
}

// exact Manila stamp for hover titles and the expanded panel
export function exactLabel(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 'Unknown time'
  return manilaFormatter({
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(d)
}

export function timeOnlyLabel(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  return manilaFormatter({ hour: 'numeric', minute: '2-digit' }).format(d)
}

// [{ key, label, rows }] - rows must already be sorted the way the table
// should display them; groups follow that order
export function groupByDay(rows, now = new Date()) {
  const groups = []
  const byKey = new Map()
  for (const row of rows) {
    // accepts raw audit rows or enriched entries ({ row: { created_at } })
    const key = dayKey(row.created_at ?? row.row?.created_at)
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: dayLabel(key, now), rows: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

// start of a Manila calendar day as a UTC timestamp
function manilaDayStartTs(key) {
  return new Date(`${key}T00:00:00+08:00`).getTime()
}

export function inDateRange(ts, range, from, to, now = new Date()) {
  if (range === 'today' || range === '7' || range === '30') {
    const t = new Date(ts).getTime()
    if (Number.isNaN(t)) return false
    const todayKey = dayKey(now)
    if (range === 'today') return t >= manilaDayStartTs(todayKey)
    const days = range === '7' ? 7 : 30
    // include today plus the previous (days - 1) Manila calendar days
    let start = manilaDayStartTs(todayKey)
    for (let i = 1; i < days; i++) {
      const prev = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      start = Math.min(start, manilaDayStartTs(dayKey(prev)))
    }
    return t >= start
  }
  if (range === 'custom' && (from || to)) {
    const key = dayKey(ts)
    if (from && key < from) return false
    if (to && key > to) return false
  }
  return true
}

// entries: enriched rows from describeEntry(); filters straight off the UI
export function filterEntries(entries, filters = {}, now = new Date()) {
  const {
    q = '',
    range = 'all',
    from = '',
    to = '',
    category = 'all',
    person = 'all',
    importantOnly = false,
    showSecurity = false,
  } = filters
  const needle = q.trim().toLowerCase()
  return entries.filter((e) => {
    if (!showSecurity && e.hidden) return false
    if (importantOnly && !e.important) return false
    if (category !== 'all' && e.category !== category) return false
    if (person !== 'all' && String(e.row.admin_email || '').toLowerCase() !== String(person).toLowerCase()) return false
    if (!inDateRange(e.row.created_at, range, from, to, now)) return false
    if (needle) {
      const hay = [
        e.sentence,
        e.row.action,
        e.row.target,
        e.row.details,
        e.row.admin_email,
      ].join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

export function hasActiveFilters(filters = {}) {
  return Boolean(
    (filters.q && filters.q.trim()) ||
    (filters.range && filters.range !== 'all') ||
    (filters.category && filters.category !== 'all') ||
    (filters.person && filters.person !== 'all') ||
    filters.importantOnly ||
    filters.showSecurity
  )
}

export function shortId(id) {
  const s = String(id || '')
  return s.length > 8 ? s.slice(0, 8) : s
}

// ------------------------------------------------------------- changes ----
// Rows recorded by the Phase B backend carry a structured { field: { from, to } }
// map in `changes`; these helpers render it for the detail panel, the CSV, and
// the few sentences that quote exact values.

const MONEY_FIELDS = new Set([
  'price', 'cost_price', 'value', 'max_discount', 'min_subtotal',
  'shipping_fee', 'free_shipping_threshold',
])

export function formatChangeValue(field, value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (MONEY_FIELDS.has(String(field)) && typeof value === 'number' && Number.isFinite(value)) {
    return `₱${formatPesos(value)}`
  }
  if (typeof value === 'number') return String(value)
  const text = String(value)
  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}

// stable, human rows for the "What changed" panel (field order follows the
// backend diff, which follows the form's field order)
export function changeLines(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return []
  return Object.entries(changes)
    .filter(([, v]) => v && typeof v === 'object' && ('from' in v || 'to' in v))
    .map(([field, v]) => ({
      field,
      label: humanizeField(field),
      from: formatChangeValue(field, v.from),
      to: formatChangeValue(field, v.to),
    }))
}

export function changesSummary(changes) {
  return changeLines(changes).map((l) => `${l.label}: ${l.from} -> ${l.to}`).join('; ')
}

function csvCell(value) {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

// UTF-8 BOM so Excel renders pesos/accents correctly
export function buildCsv(entries) {
  const header = [
    'When (Manila)',
    'When (ISO)',
    'Who',
    'What happened',
    'Category',
    'Important',
    'Action (raw)',
    'Target (raw)',
    'Details (raw)',
    'Changes',
    'Admin email (raw)',
    'Entry ID',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const e of entries) {
    lines.push([
      exactLabel(e.row.created_at),
      e.row.created_at || '',
      e.who || e.row.admin_email || '',
      e.sentence,
      e.category,
      e.important ? 'yes' : 'no',
      e.row.action || '',
      e.row.target || '',
      e.row.details || '',
      changesSummary(e.row.changes),
      e.row.admin_email || '',
      e.row.id || '',
    ].map(csvCell).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename, text) {
  const blob = new Blob([String.fromCharCode(0xfeff), text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ------------------------------------------------------- target resolver --
// Turns `user:<uuid>` / `product:<uuid>` targets into readable names so
// sentences can say "Juan Dela Cruz" / "Royal Canin Adult 10kg" instead of a
// uuid. Lookups are best-effort: a missing user name falls back to the raw
// email, a missing product to "a deleted product".

export function createResolver() {
  const userNames = new Map() // uuid -> display name
  const productNames = new Map() // uuid -> name or null (null = deleted)
  let userFetch = null
  let productFetch = null

  function loadUsers(token) {
    if (!userFetch) {
      userFetch = (async () => {
        try {
          const { items } = await apiGetAllPages('/admin/customers', token, { pageSize: 100, maxPages: 10 })
          for (const u of items || []) {
            const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
            if (u.id && name) userNames.set(u.id, name)
          }
        } catch {
          // resolver is best-effort; sentences fall back to emails / uuids
        }
      })()
    }
    return userFetch
  }

  function loadProducts(ids) {
    const missing = ids.filter((id) => !productNames.has(id))
    if (missing.length === 0) return Promise.resolve()
    if (!productFetch) productFetch = new Map()
    const jobs = missing.map(async (id) => {
      if (productFetch.has(id)) return productFetch.get(id)
      const job = (async () => {
        try {
          const data = await apiGet(`/products/${id}`)
          // GET /products/:id wraps the row as { item: {...} }; tolerate a flat body too
          const item = data?.item || data
          productNames.set(id, item?.prod_name || null)
        } catch {
          productNames.set(id, null)
        }
      })()
      productFetch.set(id, job)
      return job
    })
    return Promise.all(jobs)
  }

  return {
    async resolve(rows, token) {
      const userIds = new Set()
      const productIds = new Set()
      for (const row of rows) {
        const t = String(row.target || '')
        const m = t.match(/^(user|product):([0-9a-f-]{36})$/i)
        if (!m) continue
        if (m[1] === 'user') userIds.add(m[2])
        else productIds.add(m[2])
      }
      const jobs = []
      if (userIds.size) jobs.push(loadUsers(token))
      // cap lookups so a huge log cannot fire hundreds of requests
      if (productIds.size) jobs.push(loadProducts([...productIds].slice(0, 40)))
      await Promise.all(jobs)
      return {
        userName: (id) => userNames.get(id) || null,
        productName: (id) => (productNames.has(id) ? productNames.get(id) : null),
      }
    },
    clear() {
      userNames.clear()
      productNames.clear()
      userFetch = null
      productFetch = null
    },
  }
}

// display label for the actor behind a row: "You" for the signed-in admin,
// the resolved account name when the backend supplied one, else the email
export function whoFor(adminEmail, sessionEmail, actorName) {
  const email = String(adminEmail || '')
  if (!email || email === 'unknown') return 'Someone'
  if (sessionEmail && email.toLowerCase() === String(sessionEmail).toLowerCase()) return 'You'
  if (actorName && String(actorName).trim()) return String(actorName).trim()
  return email
}
