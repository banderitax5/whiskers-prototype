// Navigation-link and category-editor admin rules - pure helpers for
// site_nav_items / site_categories writes. The storefront merge contract
// (hidden rows keep their name visible to filters, sort_order wins, unrowed
// categories sort last) lives in frontend/lib/siteContent.js; this file is
// the write-side mirror of that contract.

export const NAV_SECTIONS = ['navbar', 'footer_shop', 'footer_account', 'footer_social']

const MAX_LABEL = 60
const MAX_NAME = 120
const MAX_HREF = 500
const MAX_ALT = 120
const MAX_CATEGORIES = 200
const MAX_SORT = 10000

// The DB check on site_nav_items.href is `^(/|https?://)` (case sensitive).
// We validate the same shape before touching PostgREST so a bad link answers
// 400 with a plain message instead of a 500 from the constraint, and we also
// reject protocol-relative `//host` links (allowed by the DB regex, but they
// escape the SPA and are never what an editor means to type).
function hrefValue(value) {
  if (typeof value !== 'string') return { ok: false, error: 'Link must be text' }
  const v = value.trim()
  if (!v) return { ok: false, error: 'Link is required (start with / or https://)' }
  if (v.length > MAX_HREF) return { ok: false, error: `Link must be ${MAX_HREF} characters or fewer` }
  if (v.startsWith('//')) return { ok: false, error: 'Use a site path (/page) or a full https:// link' }
  if (!v.startsWith('/') && !/^https?:\/\//.test(v)) {
    return { ok: false, error: 'Start the link with / (site page) or https:// (external site)' }
  }
  return { ok: true, value: v }
}

// site-local path or remote http(s) URL - same rule banners use for images
function imageUrl(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'Image must be text' }
  const v = value.trim()
  if (!v.startsWith('/') && !/^https?:\/\//i.test(v)) {
    return { ok: false, error: 'Use a site path (/image.png) or an http(s) URL' }
  }
  return { ok: true, value: v }
}

export function sanitizeNavItem(input = {}, { partial = false } = {}) {
  const fail = (error) => ({ ok: false, error })
  const out = {}

  if (!partial || input.section !== undefined) {
    if (!NAV_SECTIONS.includes(input.section)) return fail(`Section must be one of: ${NAV_SECTIONS.join(', ')}`)
    out.section = input.section
  }

  if (!partial || input.label !== undefined) {
    const label = String(input.label ?? '').trim()
    if (!label) return fail('Label is required (it is the text shoppers see)')
    if (label.length > MAX_LABEL) return fail(`Label must be ${MAX_LABEL} characters or fewer`)
    out.label = label
  }

  if (!partial || input.href !== undefined) {
    const href = hrefValue(input.href)
    if (!href.ok) return fail(href.error)
    out.href = href.value
  }

  if (!partial || input.image_url !== undefined) {
    const img = imageUrl(input.image_url)
    if (!img.ok) return fail(img.error)
    out.image_url = img.value
  }

  // alt_text is `not null` in the DB: null clears back to ''
  if (!partial || input.alt_text !== undefined) {
    if (input.alt_text === undefined || input.alt_text === null) {
      out.alt_text = ''
    } else {
      const alt = String(input.alt_text).trim()
      if (alt.length > MAX_ALT) return fail(`Alt text must be ${MAX_ALT} characters or fewer`)
      out.alt_text = alt
    }
  }

  if (!partial || input.is_visible !== undefined) {
    if (input.is_visible === undefined || input.is_visible === null) out.is_visible = true
    else if (typeof input.is_visible === 'boolean') out.is_visible = input.is_visible
    else return fail('Visible must be true or false')
  }

  return { ok: true, values: out }
}

// Batch save for the category editor: the whole merged list arrives at once
// (one request = one step-up token), each row's sort_order is its position.
// site_categories has no soft archive - a category is hidden with
// is_visible=false and a label override is cleared with label=null, so
// there is no separate "delete" operation to model here.
export function sanitizeCategoryBatch(items) {
  const fail = (error) => ({ ok: false, error })
  if (!Array.isArray(items)) return fail('Provide a categories list')
  if (items.length === 0) return fail('Save at least one category')
  if (items.length > MAX_CATEGORIES) return fail(`A save can include at most ${MAX_CATEGORIES} categories`)

  const seen = new Set()
  const values = []
  for (const raw of items) {
    const item = raw && typeof raw === 'object' ? raw : null
    if (!item) return fail('Each category must be an object')

    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return fail('Each category needs a name')
    if (name.length > MAX_NAME) return fail(`Name "${name.slice(0, 30)}..." must be ${MAX_NAME} characters or fewer`)
    if (seen.has(name)) return fail(`Duplicate category "${name.slice(0, 30)}"`)
    seen.add(name)

    let label = null
    if (item.label !== undefined && item.label !== null && item.label !== '') {
      if (typeof item.label !== 'string') return fail(`Label for "${name.slice(0, 30)}" must be text`)
      const t = item.label.trim()
      if (t.length > MAX_LABEL) return fail(`Label must be ${MAX_LABEL} characters or fewer`)
      label = t || null
    }

    if (!Number.isInteger(item.sort_order) || item.sort_order < 0 || item.sort_order > MAX_SORT) {
      return fail(`Sort order for "${name.slice(0, 30)}" must be a whole number from 0 to ${MAX_SORT}`)
    }

    let is_visible = true
    if (item.is_visible !== undefined && item.is_visible !== null) {
      if (typeof item.is_visible !== 'boolean') return fail(`Visible for "${name.slice(0, 30)}" must be true or false`)
      is_visible = item.is_visible
    }

    values.push({ name, label, sort_order: item.sort_order, is_visible })
  }
  return { ok: true, values }
}

// names to drop from site_categories (removing a newly added category that
// never got a product). Unknown names are fine - delete is idempotent.
export function sanitizeCategoryRemoval(names) {
  const fail = (error) => ({ ok: false, error })
  if (names === undefined || names === null) return { ok: true, values: [] }
  if (!Array.isArray(names)) return fail('Provide a removal list')
  if (names.length > MAX_CATEGORIES) return fail(`At most ${MAX_CATEGORIES} categories can be removed at once`)
  const values = []
  for (const raw of names) {
    if (typeof raw !== 'string') return fail('Each removed category must be text')
    const name = raw.trim()
    if (!name) return fail('Removed category names cannot be empty')
    if (name.length > MAX_NAME) return fail(`Name "${name.slice(0, 30)}..." must be ${MAX_NAME} characters or fewer`)
    values.push(name)
  }
  return { ok: true, values }
}
