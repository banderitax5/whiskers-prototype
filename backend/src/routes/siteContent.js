import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { contentLimiter, eventLimiter } from '../middleware/rateLimiter.js'
import { isSchemaPendingError } from '../utils/pgErrors.js'
import { isUuid } from '../utils/uuid.js'
import { visibleSections, bannersFor } from '../utils/siteContent.js'
import logger from '../utils/logger.js'

const router = Router()

// The storefront's single content endpoint. Everything is filtered to
// published + in-window rows server-side (drafts never reach the API) and
// cached in memory briefly so the home page does not re-query every visit.
// A database without the Phase 5 tables answers { seeded: false } and the
// storefront keeps its built-in defaults.

const CACHE_TTL_MS = 30_000
let cache = { at: 0, payload: null }

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

function navGroup(rows, section) {
  return rows
    .filter((n) => n.section === section && n.is_visible)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((n) => pick(n, NAV_FIELDS))
}

async function loadContent() {
  const [bannersRes, sectionsRes, navRes, promosRes] = await Promise.all([
    supabaseAdmin.from('site_banners').select('*').is('archived_at', null),
    supabaseAdmin.from('site_home_sections').select('*').is('archived_at', null),
    supabaseAdmin.from('site_nav_items').select('*').is('archived_at', null),
    supabaseAdmin
      .from('promos')
      .select(PROMO_FIELDS.join(', '))
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`),
  ])
  const schemaError = bannersRes.error || sectionsRes.error || navRes.error
  if (schemaError) throw schemaError
  // a database without the Phase 4 promos table still serves content; the
  // storefront just has nothing to put on sale
  const promoRows = promosRes.error ? [] : promosRes.data || []

  const now = new Date()
  const navRows = navRes.data || []
  const bannerRows = bannersRes.data || []
  return {
    seeded: true,
    banners: bannersFor('home_hero', bannerRows, now).map((b) => pick(b, BANNER_FIELDS)),
    brand_strip: bannersFor('brand_strip', bannerRows, now).map((b) => pick(b, BANNER_FIELDS)),
    strip_banners: bannersFor(['promo_strip', 'category_top'], bannerRows, now).map((b) => pick(b, BANNER_FIELDS)),
    promo_strip: bannersFor('promo_strip', bannerRows, now).map((b) => pick(b, BANNER_FIELDS)),
    category_top: bannersFor('category_top', bannerRows, now).map((b) => pick(b, BANNER_FIELDS)),
    announcement: bannersFor('announcement_bar', bannerRows, now).map((b) => pick(b, BANNER_FIELDS)),
    sections: visibleSections(sectionsRes.data || [], now).map((s) => pick(s, SECTION_FIELDS)),
    promos: promoRows.map((p) => pick(p, PROMO_FIELDS)),
    nav: {
      navbar: navGroup(navRows, 'navbar'),
      footer_shop: navGroup(navRows, 'footer_shop'),
      footer_account: navGroup(navRows, 'footer_account'),
      footer_social: navGroup(navRows, 'footer_social'),
    },
  }
}

// GET /api/site-content - public storefront content
router.get('/', contentLimiter, async (req, res) => {
  try {
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
