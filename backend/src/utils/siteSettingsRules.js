// Site settings rules - pure helpers for the single-row site_settings table
// (Phase 6). The JSONB shape is validated key by key; unknown keys are
// dropped so a stale admin form can never write arbitrary JSON.
//
// Public reads go through GET /api/site-content, which runs the result
// through publicSettings() so admin-only keys (thresholds) never reach the
// anon payload. The table itself has no RLS policies (service-role only).

export const PAYMENT_METHOD_IDS = ['gcash', 'paymaya', 'cod']

// keys only the admin dashboard needs; stripped from the public payload
export const ADMIN_ONLY_KEYS = ['low_stock_threshold', 'margin_warning_percent']

// what the storefront is born with (matches today's hardcoded values, so
// enabling the endpoint changes nothing until the owner edits settings)
export const DEFAULT_SETTINGS = {
  store_name: 'Whiskers Pet Shop',
  tagline: '',
  logo_url: null,
  contact_phone: '+63 912 345 6789',
  contact_email: '',
  contact_address: '',
  store_hours: 'Open daily 9:00 AM - 9:00 PM',
  shipping_fee: 75,
  free_shipping_threshold: null,
  payment_methods: [
    { id: 'gcash', label: 'GCash', enabled: true, instructions: '', qr_url: null },
    { id: 'paymaya', label: 'PayMaya', enabled: true, instructions: '', qr_url: null },
    { id: 'cod', label: 'COD (Cash on Delivery)', enabled: true, instructions: '', qr_url: null },
  ],
  maintenance: { enabled: false, message: '' },
  low_stock_threshold: 10,
  margin_warning_percent: 20,
}

const MAX_TEXT = {
  store_name: 80,
  tagline: 160,
  contact_phone: 40,
  contact_email: 120,
  contact_address: 200,
  store_hours: 160,
}

const MAX_MONEY = 1_000_000

function optionalText(value, max) {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'Must be text' }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > max) return { ok: false, error: `Must be ${max} characters or fewer` }
  return { ok: true, value: trimmed }
}

function imageUrl(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'Must be text' }
  const v = value.trim()
  if (!v.startsWith('/') && !/^https?:\/\//i.test(v)) {
    return { ok: false, error: 'Use a site path (/image.png) or an http(s) URL' }
  }
  return { ok: true, value: v }
}

// pesos with at most 2 decimals; null allowed where the caller says so
function money(value, { nullable }) {
  if (value === undefined || value === null || value === '') {
    return nullable ? { ok: true, value: null } : { ok: false, error: 'A number is required' }
  }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Must be zero or more' }
  if (n > MAX_MONEY) return { ok: false, error: `Must be ${MAX_MONEY} or less` }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { ok: false, error: 'Use at most two decimal places' }
  return { ok: true, value: n }
}

function positiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback }
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Must be zero or more' }
  if (n > 1_000_000) return { ok: false, error: 'That number is unrealistically large' }
  return { ok: true, value: n }
}

// the three built-in methods always exist in the saved list (in canonical
// order); the owner toggles them and fills instructions/QR per method
function paymentMethods(value) {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!Array.isArray(value)) return { ok: false, error: 'Payment methods must be a list' }
  const byId = new Map()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each payment method needs an id' }
    const id = String(raw.id || '')
    if (!PAYMENT_METHOD_IDS.includes(id)) return { ok: false, error: `Unknown payment method "${id}"` }
    if (byId.has(id)) return { ok: false, error: 'Duplicate payment method' }
    const label = optionalText(raw.label, 40)
    if (!label.ok) return { ok: false, error: label.error }
    const instructions = optionalText(raw.instructions, 1000)
    if (!instructions.ok) return { ok: false, error: instructions.error }
    const qr = imageUrl(raw.qr_url)
    if (!qr.ok) return { ok: false, error: qr.error }
    byId.set(id, {
      id,
      label: label.value || id.toUpperCase(),
      enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
      instructions: instructions.value || '',
      qr_url: qr.value,
    })
  }
  return { ok: true, value: PAYMENT_METHOD_IDS.map((id) => byId.get(id)).filter(Boolean) }
}

function maintenance(value) {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Maintenance must be an object' }
  const message = optionalText(value.message, 300)
  if (!message.ok) return { ok: false, error: message.error }
  return {
    ok: true,
    value: { enabled: Boolean(value.enabled), message: message.value || '' },
  }
}

// validate a partial patch of settings keys. Returns { ok, values } with
// only the keys present in the input (unknown keys silently dropped).
export function sanitizeSettings(input = {}) {
  const out = {}
  const fail = (error) => ({ ok: false, error })

  for (const [key, max] of Object.entries(MAX_TEXT)) {
    if (input[key] === undefined) continue
    const t = optionalText(input[key], max)
    if (!t.ok) return fail(`${key.replace(/_/g, ' ')}: ${t.error}`)
    out[key] = t.value
  }

  for (const key of ['logo_url']) {
    if (input[key] === undefined) continue
    const img = imageUrl(input[key])
    if (!img.ok) return fail(img.error)
    out[key] = img.value
  }

  if (input.shipping_fee !== undefined) {
    const m = money(input.shipping_fee, { nullable: false })
    if (!m.ok) return fail(`Shipping fee: ${m.error}`)
    out.shipping_fee = m.value
  }
  if (input.free_shipping_threshold !== undefined) {
    const m = money(input.free_shipping_threshold, { nullable: true })
    if (!m.ok) return fail(`Free shipping threshold: ${m.error}`)
    out.free_shipping_threshold = m.value
  }

  const pm = paymentMethods(input.payment_methods)
  if (!pm.ok) return fail(pm.error)
  if (pm.value !== undefined) out.payment_methods = pm.value

  const mt = maintenance(input.maintenance)
  if (!mt.ok) return fail(mt.error)
  if (mt.value !== undefined) out.maintenance = mt.value

  if (input.low_stock_threshold !== undefined) {
    const n = positiveInt(input.low_stock_threshold, DEFAULT_SETTINGS.low_stock_threshold)
    if (!n.ok) return fail(`Low stock threshold: ${n.error}`)
    out.low_stock_threshold = n.value
  }
  if (input.margin_warning_percent !== undefined) {
    const n = positiveInt(input.margin_warning_percent, DEFAULT_SETTINGS.margin_warning_percent)
    if (!n.ok) return fail(`Margin warning: ${n.error}`)
    out.margin_warning_percent = n.value
  }

  return { ok: true, values: out }
}

// merge a validated patch onto current settings (current may be empty on a
// fresh database - defaults fill the gaps)
export function mergeSettings(current = {}, patch = {}) {
  const base = { ...DEFAULT_SETTINGS, ...current }
  const merged = { ...base, ...patch }
  // a partial methods list never silently drops the other built-ins, and a
  // partial method object keeps the missing fields from the previous saved
  // value (label, instructions, qr_url)
  if (patch.payment_methods) {
    const byId = new Map(base.payment_methods.map((m) => [m.id, m]))
    for (const m of patch.payment_methods) byId.set(m.id, { ...byId.get(m.id), ...m })
    merged.payment_methods = PAYMENT_METHOD_IDS.map((id) => byId.get(id)).filter(Boolean)
  }
  return merged
}

// what the public site-content payload may see: every key except the
// admin-only ones. Defaults are applied first so a fresh install serves a
// complete shape.
export function publicSettings(settings = {}) {
  const full = { ...DEFAULT_SETTINGS, ...settings }
  const out = {}
  for (const key of Object.keys(full)) {
    if (ADMIN_ONLY_KEYS.includes(key)) continue
    out[key] = full[key]
  }
  return out
}

// enabled payment methods in canonical order (storefront + receipts)
export function enabledPaymentMethods(settings = {}) {
  const full = { ...DEFAULT_SETTINGS, ...settings }
  return (full.payment_methods || []).filter((m) => m && m.enabled)
}

// ── FAQs and policy pages (Phase 6 "remaining content") ─────────────────────

export function sanitizeFaq(input = {}) {
  const question = optionalText(input.question, 200)
  if (!question.ok) return { ok: false, error: `Question: ${question.error}` }
  if (!question.value) return { ok: false, error: 'Question is required' }
  const answer = optionalText(input.answer, 2000)
  if (!answer.ok) return { ok: false, error: `Answer: ${answer.error}` }
  if (!answer.value) return { ok: false, error: 'Answer is required' }
  const values = { question: question.value, answer: answer.value }
  if (input.is_visible !== undefined) values.is_visible = Boolean(input.is_visible)
  if (input.sort_order !== undefined) {
    const n = positiveInt(input.sort_order, 0)
    if (!n.ok) return { ok: false, error: `Sort order: ${n.error}` }
    values.sort_order = n.value
  }
  return { ok: true, values }
}

export function sanitizePolicy(input = {}) {
  const title = optionalText(input.title, 120)
  if (!title.ok) return { ok: false, error: `Title: ${title.error}` }
  if (!title.value) return { ok: false, error: 'Title is required' }
  const body = optionalText(input.body, 20_000)
  if (!body.ok) return { ok: false, error: `Body: ${body.error}` }
  const slug = optionalText(input.slug, 80)
  if (!slug.ok) return { ok: false, error: `Slug: ${slug.error}` }
  // a slug becomes the URL (/policies/your-slug); derive it from the title
  // when blank, and only allow URL-safe characters
  const derived = (slug.value || title.value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  if (!derived) return { ok: false, error: 'Slug must contain letters or numbers' }
  const values = { slug: derived, title: title.value, body: body.value || '' }
  if (input.is_visible !== undefined) values.is_visible = Boolean(input.is_visible)
  return { ok: true, values }
}
