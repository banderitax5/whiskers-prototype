// Banner admin rules - pure helpers for site_banners writes.
// Visibility/window logic lives in siteContent.js (shared with the
// storefront read path); this file covers what the admin forms may write.

export const PLACEMENTS = ['home_hero', 'brand_strip', 'category_top', 'promo_strip', 'announcement_bar']

export const LINK_TYPES = ['none', 'product', 'category', 'brand', 'promo', 'url']

const MAX_TEXT = { title: 120, subtitle: 200, buttonText: 40, alt: 200 }

function optionalText(value, max) {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'Must be text' }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > max) return { ok: false, error: `Must be ${max} characters or fewer` }
  return { ok: true, value: trimmed }
}

// banner images are either site-local paths (/banner.png) or remote http(s)
// URLs - the same rule the nav table enforces
function imageUrl(value, { required }) {
  if (value === undefined || value === null || value === '') {
    return required ? { ok: false, error: 'Desktop image is required' } : { ok: true, value: null }
  }
  if (typeof value !== 'string') return { ok: false, error: 'Must be text' }
  const v = value.trim()
  if (!v.startsWith('/') && !/^https?:\/\//i.test(v)) {
    return { ok: false, error: 'Use a site path (/image.png) or an http(s) URL' }
  }
  return { ok: true, value: v }
}

// ISO timestamps or null; ends_at must come after starts_at when both set
function scheduleValue(value, field) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { ok: false, error: `${field} must be a valid date` }
  return { ok: true, value: d.toISOString() }
}

export function sanitizeBanner(input = {}, { partial = false } = {}) {
  const out = {}
  const fail = (error) => ({ ok: false, error })

  if (!partial || input.placement !== undefined) {
    if (!PLACEMENTS.includes(input.placement)) return fail(`Placement must be one of: ${PLACEMENTS.join(', ')}`)
    out.placement = input.placement
  }
  const desktop = imageUrl(input.desktop_image_url, { required: !partial })
  if (!desktop.ok) return fail(desktop.error)
  if (desktop.value !== null || !partial) out.desktop_image_url = desktop.value

  const mobile = imageUrl(input.mobile_image_url, { required: false })
  if (!mobile.ok) return fail(mobile.error)
  if (!partial || input.mobile_image_url !== undefined) out.mobile_image_url = mobile.value

  for (const [key, max] of Object.entries(MAX_TEXT)) {
    const camel = { buttonText: 'button_text' }[key] || key
    if (partial && input[camel] === undefined) continue
    if (key === 'alt') continue // alt handled separately (required)
    const t = optionalText(input[camel], max)
    if (!t.ok) return fail(t.error)
    out[camel] = t.value
  }

  // alt text is required on create and on any update that touches images
  if (!partial || input.alt !== undefined || input.desktop_image_url !== undefined) {
    const alt = optionalText(input.alt, MAX_TEXT.alt)
    if (!alt.ok) return fail(alt.error)
    if (!alt.value) return fail('Alt text is required so screen readers can describe the image')
    out.alt = alt.value
  }

  if (!partial || input.status !== undefined) {
    if (!['draft', 'published', 'scheduled'].includes(input.status)) return fail('Status must be draft, published or scheduled')
    out.status = input.status
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
    return fail('A scheduled banner needs a start date')
  }

  if (!partial || input.link_type !== undefined) {
    const lt = input.link_type ?? 'none'
    if (!LINK_TYPES.includes(lt)) return fail(`Link type must be one of: ${LINK_TYPES.join(', ')}`)
    out.link_type = lt
    const target = input.link_target === undefined ? null : String(input.link_target).trim() || null
    if (lt === 'none') {
      out.link_target = null
    } else {
      if (!target) return fail('A link target is required for this link type')
      if (lt === 'url') {
        if (!/^https?:\/\//i.test(target)) return fail('URL links must start with http:// or https://')
      } else if (!target.startsWith('/')) {
        return fail('Product/category/promo links must start with /')
      }
      out.link_target = target
    }
  } else if (input.link_target !== undefined && !partial) {
    out.link_target = null
  }

  return { ok: true, values: out }
}
