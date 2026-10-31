// Home-section admin rules - pure helpers for site_home_sections writes.
// The storefront resolves product_row configs in frontend/lib/siteContent.js
// (resolveRowProducts); this file is the write-side mirror of that contract.

export const SECTION_TYPES = ['hero_carousel', 'product_row', 'category_tiles', 'promo_banner', 'text_block', 'brand_strip']

// rules the storefront can resolve locally today; other rule strings the DB
// accepts (best_sellers_30d, on_sale) are hidden from the admin form until
// the storefront can render them
export const RULE_KINDS = ['manual', 'category', 'brand', 'newest']

const MAX_TITLE = 80
const MAX_NAME = 60
const MAX_MANUAL_IDS = 12

const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

function scheduleValue(value, field) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { ok: false, error: `Enter a valid ${field === 'Ends at' ? 'end' : 'start'} date.` }
  return { ok: true, value: d.toISOString() }
}

// config for a product_row: { rule: 'manual' | 'category:Name' | 'brand:Name' | 'newest', product_ids? }
export function sanitizeRowConfig(config = {}) {
  const rule = String(config.rule || 'manual').trim()
  if (!RULE_KINDS.includes(rule)) {
    return { ok: false, error: 'Choose what this row should show.' }
  }
  if (rule === 'manual') {
    const ids = config.product_ids
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'Pick at least one product for a manual row' }
    if (ids.length > MAX_MANUAL_IDS) return { ok: false, error: `A row can show at most ${MAX_MANUAL_IDS} products` }
    if (ids.some((id) => !isUuid(id))) return { ok: false, error: 'Product ids must be uuids' }
    return { ok: true, value: { rule: 'manual', product_ids: ids } }
  }
  if (rule === 'category' || rule === 'brand') {
    const name = String(config.name || '').trim()
    if (!name) return { ok: false, error: `A ${rule} name is required` }
    if (name.length > MAX_NAME) return { ok: false, error: `Name must be ${MAX_NAME} characters or fewer` }
    return { ok: true, value: { rule: `${rule}:${name}` } }
  }
  return { ok: true, value: { rule: 'newest' } }
}

export function sanitizeSection(input = {}, { partial = false, defaultStatus = null, baseType = null } = {}) {
  const fail = (error) => ({ ok: false, error })
  const out = {}

  if (!partial || input.type !== undefined) {
    if (!SECTION_TYPES.includes(input.type)) return fail(`Type must be one of: ${SECTION_TYPES.join(', ')}`)
    out.type = input.type
  }

  if (partial && input.title === undefined) {
    // title untouched
  } else {
    const title = String(input.title ?? '').trim()
    if (!title) return fail('Title is required (it is the row heading shoppers see)')
    if (title.length > MAX_TITLE) return fail(`Title must be ${MAX_TITLE} characters or fewer`)
    out.title = title
  }

  if (!partial || input.status !== undefined) {
    const status = input.status ?? defaultStatus
    if (!['draft', 'published', 'scheduled'].includes(status)) return fail('Status must be draft, published or scheduled')
    out.status = status
  }
  const starts = scheduleValue(input.starts_at, 'Starts at')
  if (!starts.ok) return fail(starts.error)
  if (!partial || input.starts_at !== undefined) out.starts_at = starts.value
  const ends = scheduleValue(input.ends_at, 'Ends at')
  if (!ends.ok) return fail(ends.error)
  if (!partial || input.ends_at !== undefined) out.ends_at = ends.value
  if (out.starts_at && out.ends_at && new Date(out.ends_at) <= new Date(out.starts_at)) {
    return fail('Ends at must come after starts at')
  }
  if (out.status === 'scheduled' && !out.starts_at) {
    return fail('A scheduled section needs a start date')
  }

  if (!partial || input.config !== undefined) {
    const rowType = out.type ?? baseType
    if (!rowType) {
      // a config patch must know the effective type (the route passes the
      // stored type as baseType); guessing would silently clobber the config
      return fail('type is required to validate config')
    }
    if (rowType === 'product_row') {
      const cfg = sanitizeRowConfig(input.config)
      if (!cfg.ok) return fail(cfg.error)
      out.config = cfg.value
    } else {
      out.config = {}
    }
  }

  return { ok: true, values: out }
}
