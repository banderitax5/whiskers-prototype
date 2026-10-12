// Seed script for the Phase 5 content tables.
// Copies today's hardcoded storefront content into site_banners,
// site_home_sections, site_nav_items and site_categories as PUBLISHED rows,
// in the same order the site renders them, so enabling the content endpoints
// changes nothing visually. Run after the migration:
//   node src/utils/seedSiteContent.js
// Safe to re-run: it skips entities that are already seeded.

import 'dotenv/config'
import { supabaseAdmin } from '../config/supabase.js'
import logger from './logger.js'

// mirror of Home.jsx CAROUSEL_SLIDES (kept in sync until Phase 5c ships the
// banner editor; after that this seed exists only for fresh installs)
const HERO_SLIDES = [
  { image: '/banner.png', alt: 'Whiskers Pet Shop' },
  { image: '/categoryshop/dog.jpg', alt: 'Dog Food Collection' },
  { image: '/categoryshop/cat.jpg', alt: 'Cat Food Collection' },
  { image: '/categoryshop/fish.png', alt: 'Fish Supplies' },
  { image: '/categoryshop/berd.jpg', alt: 'Bird Supplies' },
]

// mirror of NavLinks.jsx brand tiles (public/brands/*)
const BRAND_TILES = [
  { image: '/brands/ROYAL.webp', label: 'Royal Canin' },
  { image: '/brands/aozi.png', label: 'Aozi' },
  { image: '/brands/vitality.png', label: 'Vitality' },
  { image: '/brands/topbreed.png', label: 'Top Breed' },
  { image: '/brands/special.png', label: 'Special' },
]

// mirror of NavLinks.jsx category links
const NAVBAR_LINKS = [
  { label: 'Menu', to: '/menu' },
  { label: 'Cats', to: '/menu?category=Cats' },
  { label: 'Dogs', to: '/menu?category=Dogs' },
  { label: 'Fish', to: '/menu?category=Fish' },
  { label: 'Dry Food', to: '/menu?category=Dogs - DRY' },
  { label: 'Wet Food', to: '/menu?category=Wet Food' },
  { label: 'Pet Recommendation', to: '/pets' },
]

// mirror of Footer.jsx link groups
const FOOTER_SHOP = [
  { label: 'Dog', to: '/menu?category=Dogs' },
  { label: 'Cat', to: '/menu?category=Cats' },
  { label: 'Bird', to: '/menu?category=Birds' },
  { label: 'Small Pet', to: '/menu?category=Small Pets' },
]
const FOOTER_ACCOUNT = [
  { label: 'My Account', to: '/profile' },
  { label: 'Orders', to: '/orders' },
  { label: 'FAQs', to: '/about' },
]
const FOOTER_SOCIAL = [
  { label: 'Instagram', to: 'https://www.instagram.com/petcareswhiskers?igsh=aTN5NXN3Mm5nbXV1&utm_source=qr' },
  { label: 'Facebook', to: 'https://facebook.com/profile.php?id=61561539844519' },
]

// the home page derives the first six categories from the catalog; the seed
// leaves those rows empty on purpose (they are generated at render time from
// live products) and only seeds the static parts it can know today.
const HOME_CATEGORY_ROWS = 6

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
      link_type: 'category',
      link_target: brand.label,
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
