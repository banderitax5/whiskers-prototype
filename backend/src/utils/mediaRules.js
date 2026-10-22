// Media library rules - pure helpers shared by the admin routes.
// Kept separate from the route so the owner-facing validation (alt text
// required, pagination clamps, "where is this image used?" warnings) is
// unit-testable without touching Supabase.

export const MAX_ALT_LENGTH = 200

// every image needs alt text - the storefront is not accessible without it
// and the broken-image detector cannot tell which slide is which
export function sanitizeAltText(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Alt text is required' }
  const value = raw.trim().replace(/\s+/g, ' ')
  if (!value) return { ok: false, error: 'Alt text is required' }
  if (value.length > MAX_ALT_LENGTH) {
    return { ok: false, error: `Alt text must be ${MAX_ALT_LENGTH} characters or fewer` }
  }
  return { ok: true, value }
}

// clamps page/pageSize so a hand-edited URL can never produce an unbounded
// or negative query
export function mediaPageParams(raw = {}) {
  let page = Number.parseInt(raw.page, 10)
  if (!Number.isInteger(page) || page < 1) page = 1
  let pageSize = Number.parseInt(raw.pageSize, 10)
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = 12
  return { page, pageSize: Math.min(pageSize, 48) }
}

// usage lookup for the "this image is used by" warning before archive.
// refs shape: { banners: row[], nav: row[], sections: row[] } where section
// rows carry config as JSON-ready text.
export function buildUsageIndex(urls, refs = {}) {
  const index = new Map()
  for (const url of urls) {
    const hits = []
    for (const b of refs.banners || []) {
      if (b.desktop_image_url === url) hits.push({ entity: 'banner', id: b.id, label: `Banner (${b.placement})` })
      if (b.mobile_image_url === url) hits.push({ entity: 'banner', id: b.id, label: `Banner mobile (${b.placement})` })
    }
    for (const n of refs.nav || []) {
      if (n.image_url === url) hits.push({ entity: 'nav', id: n.id, label: `Nav item (${n.section})` })
    }
    for (const s of refs.sections || []) {
      if (typeof s.configText === 'string' && s.configText.includes(url)) {
        hits.push({ entity: 'section', id: s.id, label: `Home section (${s.title || s.type})` })
      }
    }
    index.set(url, hits)
  }
  return index
}
