import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { contentLimiter, eventLimiter } from '../middleware/rateLimiter.js'
import { isSchemaPendingError } from '../utils/pgErrors.js'
import { isUuid } from '../utils/uuid.js'
import { visibleSections, bannersFor, previewRows } from '../utils/siteContent.js'
import { publicSettings } from '../utils/siteSettingsRules.js'
import logger from '../utils/logger.js'

const router = Router()

// The storefront's single content endpoint. Everything is filtered to
// published + in-window rows server-side (drafts never reach the API) and
// cached in memory briefly so the home page does not re-query every visit.
// A database without the Phase 5 tables answers { seeded: false } and the
// storefront keeps its built-in defaults.

const CACHE_TTL_MS = 30_000
let cache = { at: 0, payload: null }

// Admin writes (banners, sections, nav links, categories, promos) call this
// so an edit is live on the next storefront request instead of waiting out
// the TTL.
export function invalidateContentCache() {
  cache = { at: 0, payload: null }
}

function pick(row, fields) {
  const out = {}
  for (const f of fields) out[f] = row[f]
  return out
}

const BANNER_FIELDS = [
  'id', 'placement', 'desktop_image_url', 'mobile_image_url', 'alt',
  'title', 'subtitle', 'button_text', 'link_type', 'link_target', 'sort_order',
]
const SECTION_FIELDS = ['id', 'type', 'title', 'config', 'sort_order']
const NAV_FIELDS = ['id', 'section', 'label', 'href', 'image_url', 'alt_text', 'sort_order']
// sanitized promo fields for storefront display - the code and usage counts
// never leave the server; shoppers see the discount, not how to type it
const PROMO_FIELDS = ['type', 'value', 'scope', 'target_id', 'min_subtotal', 'max_discount', 'starts_at', 'ends_at']
const FAQ_FIELDS = ['id', 'question', 'answer', 'sort_order']
const POLICY_FIELDS = ['id', 'slug', 'title', 'body']

function navGroup(rows, section) {
  return rows
    .filter((n) => n.section === section && n.is_visible)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((n) => pick(n, NAV_FIELDS))
}

async function loadContent({ preview = false } = {}) {
  const [bannersRes, sectionsRes, navRes, promosRes, catsRes, settingsRes, faqsRes, policiesRes] = await Promise.all([
    supabaseAdmin.from('site_banners').select('*').is('archived_at', null),
    supabaseAdmin.from('site_home_sections').select('*').is('archived_at', null),
    supabaseAdmin.from('site_nav_items').select('*').is('archived_at', null),
    supabaseAdmin
      .from('promos')
      .select(PROMO_FIELDS.join(', '))
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`),
    // category overrides ship in full (hidden rows included) - the storefront
    // needs the hidden names to drop them from its own derived list
    supabaseAdmin.from('site_categories').select('name, label, sort_order, is_visible'),
    // Phase 6 tables: like promos, a database without them still serves
    // content; the storefront just falls back to built-in settings/FAQs
    supabaseAdmin.from('site_settings').select('data').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('site_faqs').select('*').is('archived_at', null),
    supabaseAdmin.from('site_policies').select('*').is('archived_at', null),
  ])
  const schemaError = bannersRes.error || sectionsRes.error || navRes.error || catsRes.error
  if (schemaError) throw schemaError
  // a database without the Phase 4 promos table still serves content; the
  // storefront just has nothing to put on sale
  const promoRows = promosRes.error ? [] : promosRes.data || []
  const settings = publicSettings(settingsRes.error ? {} : settingsRes.data?.data || {})
  const visibleList = (res) =>
    (res.error ? [] : res.data || [])
      .filter((r) => r.is_visible !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  const faqRows = visibleList(faqsRes)
  const policyRows = visibleList(policiesRes)

  const now = new Date()
  const navRows = navRes.data || []
  const bannerRows = bannersRes.data || []
  const sectionRows = sectionsRes.data || []
  // preview drops the draft/schedule filters so the owner sees what WILL show
  // once published; archived rows stay excluded, and hidden nav links stay
  // filtered (they are a separate toggle the owner flips to see them)
  const bannerPick = (placement) =>
    preview
      ? previewRows(bannerRows).filter((b) => (Array.isArray(placement) ? placement : [placement]).includes(b.placement))
      : bannersFor(placement, bannerRows, now)
  const sectionPick = () => (preview ? previewRows(sectionRows) : visibleSections(sectionRows, now))
  const sectionFields = preview ? [...SECTION_FIELDS, 'status'] : SECTION_FIELDS
  return {
    seeded: true,
    preview,
    banners: bannerPick('home_hero').map((b) => pick(b, BANNER_FIELDS)),
    brand_strip: bannerPick('brand_strip').map((b) => pick(b, BANNER_FIELDS)),
    strip_banners: bannerPick(['promo_strip', 'category_top']).map((b) => pick(b, BANNER_FIELDS)),
    promo_strip: bannerPick('promo_strip').map((b) => pick(b, BANNER_FIELDS)),
    category_top: bannerPick('category_top').map((b) => pick(b, BANNER_FIELDS)),
    announcement: bannerPick('announcement_bar').map((b) => pick(b, BANNER_FIELDS)),
    sections: sectionPick().map((s) => pick(s, sectionFields)),
    promos: promoRows.map((p) => pick(p, PROMO_FIELDS)),
    settings,
    faqs: faqRows.map((f) => pick(f, FAQ_FIELDS)),
    policies: policyRows.map((p) => pick(p, POLICY_FIELDS)),
    categories: (catsRes.data || []).map((c) => pick(c, ['name', 'label', 'sort_order', 'is_visible'])),
    nav: {
      navbar: navGroup(navRows, 'navbar'),
      footer_shop: navGroup(navRows, 'footer_shop'),
      footer_account: navGroup(navRows, 'footer_account'),
      footer_social: navGroup(navRows, 'footer_social'),
    },
  }
}

// ?preview=1 with a valid admin session serves drafts + scheduled-out content
// so the owner can see the storefront before publishing. Any other caller
// (anon, non-admin, expired token) gets the ordinary public payload - preview
// is an addition to the public endpoint, never a widening of it.
async function isAdminPreview(req) {
  if (String(req.query.preview) !== '1') return false
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data?.user) return false
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', data.user.id).single()
    return prof?.role === 'admin'
  } catch {
    return false
  }
}

// GET /api/site-content - public storefront content
router.get('/', contentLimiter, async (req, res) => {
  try {
    // preview answers are never cached - the owner edits and re-checks in the
    // same session, and mixing draft payloads into the public cache would leak
    if (await isAdminPreview(req)) {
      return res.json(await loadContent({ preview: true }))
    }
    if (Date.now() - cache.at >= CACHE_TTL_MS) {
      try {
        cache = { at: Date.now(), payload: await loadContent() }
      } catch (err) {
        if (!isSchemaPendingError(err)) throw err
        // tables not created yet: the storefront falls back to built-ins
        cache = { at: Date.now(), payload: { seeded: false } }
      }
    }
    res.json(cache.payload)
  } catch (err) {
    logger.error({ err }, 'Site content error')
    res.status(500).json({ error: 'Failed to load content' })
  }
})

// POST /api/site-content/events - banner impression / click / broken report.
// Anonymous by design (no login), rate limited, best effort: a failure must
// never break the page, so every path answers 204.
router.post('/events', eventLimiter, async (req, res) => {
  const { bannerId, event } = req.body ?? {}
  if (!isUuid(bannerId) || !['impression', 'click', 'broken'].includes(event)) {
    return res.status(400).json({ error: 'Invalid event' })
  }
  try {
    const { error } = await supabaseAdmin
      .from('site_banner_events')
      .insert({ banner_id: bannerId, event_type: event })
    if (error) {
      if (isSchemaPendingError(error)) return res.status(204).end()
      throw error
    }
    if (event === 'impression' || event === 'click') {
      // the counter update is best effort, but a silent failure would make the
      // analytics meaningless - check the result so failures are visible
      const bump = event === 'impression' ? 'bump_banner_impression' : 'bump_banner_click'
      const { error: bumpErr } = await supabaseAdmin.rpc(bump, { p_banner: bannerId })
      if (bumpErr) logger.warn({ err: bumpErr, bannerId, event }, 'Banner counter update failed')
    }
  } catch (err) {
    logger.warn({ err }, 'Banner event error')
  }
  res.status(204).end()
})

export default router
