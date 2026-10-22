// Storefront content client: one cached fetch of /api/site-content per page
// load. When the endpoint is unreachable or not seeded yet, every getter
// returns null so each component keeps using its built-in defaults and the
// site never loses content.
//
// Preview mode (Phase 5g): an admin clicks "Preview storefront", which opens
// the site with ?scPreview=1. That param arms a 10-minute preview flag in
// sessionStorage; every fetch then goes out with the admin's own session
// token and ?preview=1 so drafts and scheduled-out rows are served. The flag
// dies with the tab (or on Exit preview), and shoppers without it always get
// the public payload - the backend ignores preview for anyone but admins.
//
// The supabase client is imported lazily (only when a preview fetch needs a
// token) so this module stays importable in non-browser test environments
// that only use the pure helpers.

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const PREVIEW_FLAG = 'scPreviewUntil'
const PREVIEW_TTL_MS = 10 * 60 * 1000

let cache = null
let inflight = null
let previewActive = false
let previewCache = null
let previewInflight = null

// Runs once when this module loads (before any component fetches) so the
// flag is armed before the first request, even when several components race
// to call fetchSiteContent on mount. Exported for tests and re-arming.
export function consumePreviewParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('scPreview') === '1') {
      sessionStorage.setItem(PREVIEW_FLAG, String(Date.now() + PREVIEW_TTL_MS))
      params.delete('scPreview')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    }
    const until = Number(sessionStorage.getItem(PREVIEW_FLAG) || 0)
    previewActive = Date.now() < until
    if (!previewActive) {
      previewCache = null
      previewInflight = null
    }
  } catch {
    previewActive = false
  }
  return previewActive
}

consumePreviewParam()

export function isPreviewMode() {
  return previewActive
}

export function exitPreview() {
  try {
    sessionStorage.removeItem(PREVIEW_FLAG)
  } catch {
    /* private mode: flag just dies with the tab */
  }
  previewActive = false
  previewCache = null
  previewInflight = null
}

async function previewToken() {
  try {
    const { default: supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || null
  } catch {
    return null
  }
}

// force=true drops any cached snapshot first - used by components that
// remount on navigation (home, nav links) so an admin edit shows up on the
// next visit instead of only after a hard refresh. Concurrent callers still
// share one in-flight request. Preview responses are cached separately so a
// draft payload can never be served to a public request.
export async function fetchSiteContent(force = false) {
  if (previewActive) {
    if (force) previewCache = null
    if (previewCache) return previewCache
    if (previewInflight) return previewInflight
    const token = await previewToken()
    if (!token) {
      // session expired mid-preview: fall through to the public payload
      // rather than showing built-in fallbacks
      previewActive = false
    } else {
      previewInflight = fetch(`${API_BASE}/site-content?preview=1`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          previewCache = data && data.seeded ? data : null
          previewInflight = null
          return previewCache
        })
        .catch(() => {
          previewInflight = null
          return null
        })
      return previewInflight
    }
  }
  if (force) cache = null
  if (cache) return cache
  if (inflight) return inflight
  inflight = fetch(`${API_BASE}/site-content`, { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      cache = data && data.seeded ? data : null
      inflight = null
      return cache
    })
    .catch(() => {
      inflight = null
      return null
    })
  return inflight
}

export function resetSiteContentCache() {
  cache = null
  inflight = null
  previewCache = null
  previewInflight = null
}

// returns the published banners for a placement, or null when unavailable
// (so the caller can fall back to its own defaults)
export function contentBanners(content, key) {
  if (!content || !Array.isArray(content[key]) || content[key].length === 0) return null
  return content[key]
}

// published sections of one type, or null
export function contentSections(content, type) {
  if (!content || !Array.isArray(content.sections)) return null
  const rows = content.sections.filter((s) => s.type === type)
  return rows.length > 0 ? rows : null
}

// one section of a type (the first one), or null
export function contentSection(content, type) {
  const rows = contentSections(content, type)
  return rows ? rows[0] : null
}

// nav group, or null when the group is empty / missing
export function contentNav(content, section) {
  if (!content?.nav) return null
  const rows = content.nav[section]
  return Array.isArray(rows) && rows.length > 0 ? rows : null
}

// ── Phase 6: settings, FAQs, policies ───────────────────────────────────────

// built-in settings, mirroring backend DEFAULT_SETTINGS so a fresh install
// (or a fetch failure) shows exactly what the site showed before Phase 6
export const CLIENT_DEFAULT_SETTINGS = {
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
}

// merged settings (server values over the built-in defaults). Never null -
// callers can read fields directly.
export function contentSettings(content) {
  const s = content?.settings
  if (!s || typeof s !== 'object') return { ...CLIENT_DEFAULT_SETTINGS }
  return { ...CLIENT_DEFAULT_SETTINGS, ...s }
}

// owner-authored FAQs, or null so the About page keeps its built-in list
export function contentFaqs(content) {
  if (!Array.isArray(content?.faqs) || content.faqs.length === 0) return null
  return content.faqs.map((f) => ({ q: f.question, a: f.answer }))
}

// policy pages from the content endpoint (visible rows only)
export function contentPolicies(content) {
  if (!Array.isArray(content?.policies) || content.policies.length === 0) return null
  return content.policies
}

// merges the catalog's category names with the owner's category overrides:
// hidden rows drop out of the list, labels replace the display text (the
// filter value stays the raw category name), a saved sort_order wins, and
// categories the owner never saved keep their base position at the end.
// No override rows -> the base list comes back unchanged, so a fresh install
// looks exactly like it did before this feature existed.
export function applyCategoryOverrides(baseNames, rows) {
  const names = Array.isArray(baseNames) ? baseNames : []
  const overrides = new Map()
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r && typeof r.name === 'string' && r.name) overrides.set(r.name, r)
    }
  }
  const merged = []
  names.forEach((name, idx) => {
    const o = overrides.get(name)
    if (o && o.is_visible === false) return
    merged.push({
      name,
      label: (o && o.label) || name,
      sort: o && Number.isInteger(o.sort_order) ? o.sort_order : Infinity,
      idx,
    })
  })
  merged.sort((a, b) => a.sort - b.sort || a.idx - b.idx)
  return merged.map(({ name, label }) => ({ name, label }))
}

// record a banner event; never throws, never blocks the UI
export async function trackBannerEvent(bannerId, event) {
  try {
    await fetch(`${API_BASE}/site-content/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bannerId, event }),
      keepalive: true,
    })
  } catch {
    /* analytics are best effort */
  }
}

// resolves the products a product_row section should show. Rules the
// storefront can compute locally are handled here; anything else falls back
// to an empty list so the section renders its empty state instead of junk.
export function resolveRowProducts(section, allProducts, limit = 7) {
  if (!section || !Array.isArray(allProducts)) return []
  const config = section.config || {}
  const rule = String(config.rule || 'manual')
  let picked = []
  if (rule === 'manual' && Array.isArray(config.product_ids)) {
    const byId = new Map(allProducts.map((p) => [p.prod_id, p]))
    picked = config.product_ids.map((id) => byId.get(id)).filter(Boolean)
  } else if (rule.startsWith('category:')) {
    const name = rule.slice('category:'.length)
    picked = allProducts.filter((p) => p.category === name)
  } else if (rule.startsWith('brand:')) {
    const name = rule.slice('brand:'.length)
    picked = allProducts.filter((p) => p.brand === name)
  } else if (rule === 'newest') {
    picked = [...allProducts].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }
  return picked.slice(0, limit)
}
