import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchSiteContent, contentBanners, contentNav, trackBannerEvent } from '../lib/siteContent.js'
import { bannerHref } from '../lib/bannerLink.js'

// label a brand-strip row by whichever field shape it has: banner rows from
// the admin (alt/title) or the built-in fallback array (label)
function brandLabel(brand) {
  return brand.title || brand.alt || brand.label || ''
}

// brand tile that hides its image if the file fails to load so a missing
// asset never renders as a broken grey box (C3)
function BrandTile({ brand, active }) {
  const [failed, setFailed] = useState(false)
  const image = brand.desktop_image_url || brand.image_url || brand.image
  const label = brandLabel(brand)
  // honor the destination the admin configured; legacy rows whose target
  // cannot be interpreted keep the old behavior: this tile opens the menu
  // filtered to its own brand
  const href = bannerHref(brand) || (label ? `/menu?brand=${encodeURIComponent(label)}` : null)

  // one impression per display; clicks counted on activation
  useEffect(() => {
    if (brand?.id) trackBannerEvent(brand.id, 'impression')
  }, [brand?.id])

  if (!href) return null

  return (
    <Link
      to={href}
      onClick={() => { if (brand?.id) trackBannerEvent(brand.id, 'click') }}
      className={`h-8 min-h-[2rem] min-w-0 flex-1 cursor-pointer rounded-lg transition-all duration-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0b2e59] focus:ring-offset-2 sm:h-12 md:h-14 flex items-center justify-center overflow-hidden ${
        active
          ? 'bg-[#0b2e59] ring-2 ring-[#ffd21e] dark:bg-[#0b2e59]'
          : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600'
      }`}
      aria-label={`Shop ${label || 'brand'}`}
    >
      {image && !failed && (
        <img
          src={image}
          alt={label}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover p-0 transition-transform duration-200 hover:scale-105"
        />
      )}
    </Link>
  )
}

function NavLinks() {
  const [searchParams] = useSearchParams()
  const activeBrand = searchParams.get('brand') || ''
  const [content, setContent] = useState(null)

  // content-backed navigation and brand tiles; forced so banner edits are
  // visible on the next navigation, not only after a hard refresh. The
  // built-in arrays render until the tables are seeded.
  useEffect(() => {
    let cancelled = false
    fetchSiteContent(true).then((data) => { if (!cancelled) setContent(data) })
    return () => { cancelled = true }
  }, [])

  const placeholderLinks = [
    { label: 'Menu', href: '/menu' },
    { label: 'Cats', href: '/menu?category=Cats' },
    { label: 'Dogs', href: '/menu?category=Dogs' },
    { label: 'Fish', href: '/menu?category=Fish' },
    { label: 'Dry Food', href: '/menu?category=Dogs - DRY' },
    { label: 'Wet Food', href: '/menu?category=Wet Food' },
    { label: 'Pet Recommendation', href: '/pets' },
  ]

  // file names must match the case used under public/brands (served files
  // are case-sensitive on Linux hosts)
  const fallbackBrands = [
    { image: '/brands/ROYAL.webp', label: 'Royal Canin' },
    { image: '/brands/aozi.png', label: 'Aozi' },
    { image: '/brands/vitality.png', label: 'Vitality' },
    { image: '/brands/topbreed.png', label: 'Top Breed' },
    { image: '/brands/special.png', label: 'Special' },
  ]

  // once content has loaded it is the source of truth: drafting every nav
  // link or brand tile removes them from the strip. The built-in arrays only
  // render when content is unavailable (fresh install / request failed).
  const navItems = content ? (contentNav(content, 'navbar') || []) : placeholderLinks
  const brands = content ? (contentBanners(content, 'brand_strip') || []) : fallbackBrands

  return (
    <div className="bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      <div className="px-3 sm:px-4 lg:mx-auto lg:max-w-7xl">
        <nav
          className="flex w-full flex-wrap items-center justify-between gap-x-1 gap-y-2 py-3 sm:gap-x-2 md:flex-nowrap md:py-3.5"
          aria-label="Category links"
        >
          {navItems.map((item) => (
            <Link
              key={item.id || item.label}
              to={item.href}
              className="text-center text-xs font-medium text-gray-700 hover:text-[#0b2e59] hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition-all duration-200 px-2.5 py-1.5 rounded-lg sm:px-3 sm:text-sm"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div
          className="flex w-full items-stretch gap-1.5 pb-2 sm:gap-3 sm:pb-5"
          aria-label="Popular brands"
        >
          {brands.map((brand) => (
            <BrandTile
              key={brand.id || brandLabel(brand)}
              brand={brand}
              active={activeBrand === brandLabel(brand)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default NavLinks
