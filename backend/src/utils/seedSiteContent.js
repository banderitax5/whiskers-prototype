// Seed script for the Phase 5 content tables.
// Copies the built-in storefront defaults (utils/siteContentDefaults.js) into
// site_banners, site_nav_items and site_home_sections as PUBLISHED rows
// (home sections as drafts), in the same order the site renders them, so
// enabling the content endpoints changes nothing visually. Run after the
// migration:
//   node src/utils/seedSiteContent.js
// Safe to re-run: it skips entities that are already seeded.
// Category overrides (site_categories) are never seeded - the filter list is
// derived from the live catalog until the owner saves an override.

import 'dotenv/config'
import { supabaseAdmin } from '../config/supabase.js'
import logger from './logger.js'
import { HERO_SLIDES, BRAND_TILES, NAVBAR_LINKS, FOOTER_SHOP, FOOTER_ACCOUNT, FOOTER_SOCIAL, HOME_CATEGORY_ROWS } from './siteContentDefaults.js'

// defaults moved to utils/siteContentDefaults.js so the restore-defaults
// admin endpoint uses the exact same rows as this seed script

async function seededCount(table, column, value) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true })
  if (column) query = query.eq(column, value)
  const { count, error } = await query
  if (error) {
    if (/does not exist|PGRST205/i.test(JSON.stringify(error))) {
      logger.error(`Table ${table} does not exist - run the migration first`)
      process.exit(1)
    }
    throw error
  }
  return count ?? 0
}

async function main() {
  // 1. hero carousel
  if ((await seededCount('site_banners')) === 0) {
    const rows = HERO_SLIDES.map((slide, i) => ({
      placement: 'home_hero',
      desktop_image_url: slide.image,
      alt: slide.alt,
      link_type: 'none',
      status: 'published',
      sort_order: i,
      created_by: 'seed',
    }))
    const { error } = await supabaseAdmin.from('site_banners').insert(rows)
    if (error) throw error
    logger.info(`Seeded ${rows.length} hero carousel slides`)
  }

  // 2. brand strip
  const { data: stripBanners } = await supabaseAdmin
    .from('site_banners')
    .select('id')
    .eq('placement', 'brand_strip')
  if (!stripBanners || stripBanners.length === 0) {
    const rows = BRAND_TILES.map((brand, i) => ({
      placement: 'brand_strip',
      desktop_image_url: brand.image,
      alt: brand.label,
      link_type: 'brand',
      link_target: `/menu?brand=${encodeURIComponent(brand.label)}`,
      status: 'published',
      sort_order: i,
      created_by: 'seed',
    }))
    const { error } = await supabaseAdmin.from('site_banners').insert(rows)
    if (error) throw error
    logger.info(`Seeded ${rows.length} brand tiles`)
  }

  // 3. nav + footer links (each section is checked on its own so a re-run
  //    only adds what is missing)
  const navGroups = [
    ['navbar', NAVBAR_LINKS],
    ['footer_shop', FOOTER_SHOP],
    ['footer_account', FOOTER_ACCOUNT],
    ['footer_social', FOOTER_SOCIAL],
  ]
  for (const [section, links] of navGroups) {
    if ((await seededCount('site_nav_items', 'section', section)) > 0) continue
    const rows = links.map((l, i) => ({ section, label: l.label, href: l.to, sort_order: i }))
    const { error } = await supabaseAdmin.from('site_nav_items').insert(rows)
    if (error) throw error
    logger.info(`Seeded ${rows.length} ${section} links`)
  }

  // 4. placeholders for the home category rows so the section editor has a
  //    row to edit on a fresh install. The storefront still renders its
  //    built-in rows while these stay drafts.
  if ((await seededCount('site_home_sections')) === 0) {
    const rows = Array.from({ length: HOME_CATEGORY_ROWS }, (_, i) => ({
      type: 'product_row',
      title: `Row ${i + 1}`,
      config: { rule: 'category', category: '' },
      status: 'draft',
      sort_order: i,
      created_by: 'seed',
    }))
    const { error } = await supabaseAdmin.from('site_home_sections').insert(rows)
    if (error) throw error
    logger.info(`Seeded ${rows.length} draft home section placeholders`)
  }

  logger.info('Content seed complete. Seeded rows mirror the built-in defaults, so the storefront looks identical.')
}

main().catch((err) => {
  logger.error({ err }, 'Content seed failed')
  process.exit(1)
})
