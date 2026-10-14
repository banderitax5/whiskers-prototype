// Storefront content client: one cached fetch of /api/site-content per page
// load. When the endpoint is unreachable or not seeded yet, every getter
// returns null so each component keeps using its built-in defaults and the
// site never loses content.

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

let cache = null
let inflight = null

// force=true drops any cached snapshot first - used by components that
// remount on navigation (home, nav links) so an admin edit shows up on the
// next visit instead of only after a hard refresh. Concurrent callers still
// share one in-flight request.
export async function fetchSiteContent(force = false) {
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
