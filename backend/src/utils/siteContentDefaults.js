// The built-in storefront defaults, in one module shared by the seed script
// (fresh installs) and the restore-defaults admin endpoint (putting a broken
// section back). Keeping a single copy means the two can never drift.

// mirror of Home.jsx CAROUSEL_SLIDES
export const HERO_SLIDES = [
  { image: '/banner.png', alt: 'Whiskers Pet Shop' },
  { image: '/categoryshop/dog.jpg', alt: 'Dog Food Collection' },
  { image: '/categoryshop/cat.jpg', alt: 'Cat Food Collection' },
  { image: '/categoryshop/fish.png', alt: 'Fish Supplies' },
  { image: '/categoryshop/berd.jpg', alt: 'Bird Supplies' },
]

// mirror of NavLinks.jsx brand tiles (public/brands/*)
export const BRAND_TILES = [
  { image: '/brands/ROYAL.webp', label: 'Royal Canin' },
  { image: '/brands/aozi.png', label: 'Aozi' },
  { image: '/brands/vitality.png', label: 'Vitality' },
  { image: '/brands/topbreed.png', label: 'Top Breed' },
  { image: '/brands/special.png', label: 'Special' },
]

// mirror of NavLinks.jsx category links
export const NAVBAR_LINKS = [
  { label: 'Menu', to: '/menu' },
  { label: 'Cats', to: '/menu?category=Cats' },
  { label: 'Dogs', to: '/menu?category=Dogs' },
  { label: 'Fish', to: '/menu?category=Fish' },
  { label: 'Dry Food', to: '/menu?category=Dogs - DRY' },
  { label: 'Wet Food', to: '/menu?category=Wet Food' },
  { label: 'Pet Recommendation', to: '/pets' },
]

// mirror of Footer.jsx link groups
export const FOOTER_SHOP = [
  { label: 'Dog', to: '/menu?category=Dogs' },
  { label: 'Cat', to: '/menu?category=Cats' },
  { label: 'Bird', to: '/menu?category=Birds' },
  { label: 'Small Pet', to: '/menu?category=Small Pets' },
]
export const FOOTER_ACCOUNT = [
  { label: 'My Account', to: '/profile' },
  { label: 'Orders', to: '/orders' },
  { label: 'FAQs', to: '/about' },
]
export const FOOTER_SOCIAL = [
  { label: 'Instagram', to: 'https://www.instagram.com/petcareswhiskers?igsh=aTN5NXN3Mm5nbXV1&utm_source=qr' },
  { label: 'Facebook', to: 'https://facebook.com/profile.php?id=61561539844519' },
]

// the home page derives the first six categories from the catalog; the seed
// leaves those rows empty on purpose (they are generated at render time from
// live products) and only seeds the static parts it can know today.
export const HOME_CATEGORY_ROWS = 6

const NAV_GROUPS = {
  navbar: NAVBAR_LINKS,
  footer_shop: FOOTER_SHOP,
  footer_account: FOOTER_ACCOUNT,
  footer_social: FOOTER_SOCIAL,
}

export const RESTORE_SCOPES = [
  'home_hero', 'brand_strip',
  'navbar', 'footer_shop', 'footer_account', 'footer_social',
  'home_sections',
]

// Returns { table, placement|section, rows } for a scope, or null for an
// unknown scope. Rows are plain inserts (no ids) in render order.
export function defaultRowsFor(scope) {
  if (scope === 'home_hero') {
    return {
      table: 'site_banners',
      filter: { column: 'placement', value: 'home_hero' },
      rows: HERO_SLIDES.map((s, i) => ({
        placement: 'home_hero',
        desktop_image_url: s.image,
        alt: s.alt,
        link_type: 'none',
        status: 'published',
        sort_order: i,
      })),
    }
  }
  if (scope === 'brand_strip') {
    return {
      table: 'site_banners',
      filter: { column: 'placement', value: 'brand_strip' },
      rows: BRAND_TILES.map((b, i) => ({
        placement: 'brand_strip',
        desktop_image_url: b.image,
        alt: b.label,
        link_type: 'brand',
        link_target: `/menu?brand=${encodeURIComponent(b.label)}`,
        status: 'published',
        sort_order: i,
      })),
    }
  }
  if (NAV_GROUPS[scope]) {
    return {
      table: 'site_nav_items',
      filter: { column: 'section', value: scope },
      rows: NAV_GROUPS[scope].map((l, i) => ({ section: scope, label: l.label, href: l.to, sort_order: i })),
    }
  }
  if (scope === 'home_sections') {
    return {
      table: 'site_home_sections',
      filter: null,
      rows: Array.from({ length: HOME_CATEGORY_ROWS }, (_, i) => ({
        type: 'product_row',
        title: `Row ${i + 1}`,
        config: { rule: 'category', category: '' },
        status: 'draft',
        sort_order: i,
      })),
    }
  }
  return null
}
