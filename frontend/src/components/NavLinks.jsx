import React from 'react'
import { Link } from 'react-router-dom'

function NavLinks() {
  const placeholderLinks = [
    { label: 'Menu', to: '/menu' },
    { label: 'Cats', to: '/menu?category=Cats' },
    { label: 'Dogs', to: '/menu?category=Dogs' },
    { label: 'Fish', to: '/menu?category=Fish' },
    { label: 'Dry Food', to: '/menu?category=Dogs - DRY' },
    { label: 'Wet Food', to: '/menu?category=Wet Food' },
    { label: 'Pet Recommendation', to: '/pets' },
  ]

  const brands = [
    { key: 'royal', image: '/brands/ROYAL.webp', label: 'Royal Canin' },
    { key: 'aozi', image: '/brands/AOZI.png', label: 'Aozi' },
    { key: 'vitality', image: '/brands/vitality.png', label: 'Vitality' },
    { key: 'topbreed', image: '/brands/topbreed.png', label: 'Top Breed' },
    { key: 'special', image: '/brands/special.png', label: 'Special' },
    { key: 'empty-1', image: null, label: '' },
    { key: 'empty-2', image: null, label: '' },
    { key: 'empty-3', image: null, label: '' },
  ]

  return (
    <div className="bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      <div className="px-3 sm:px-4 lg:mx-auto lg:max-w-7xl">
        <nav
          className="flex w-full flex-wrap items-center justify-between gap-x-1 gap-y-2 py-3 sm:gap-x-2 md:flex-nowrap md:py-3.5"
          aria-label="Category links"
        >
          {placeholderLinks.map((item) => (
            <Link
              key={item.label}
              to={item.to}
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
            <Link
              key={brand.key}
              to="/menu"
              className="h-8 min-h-[2rem] min-w-0 flex-1 cursor-pointer rounded-lg bg-gray-200 transition-all duration-200 hover:bg-gray-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0b2e59] focus:ring-offset-2 sm:h-12 md:h-14 dark:bg-gray-700 dark:hover:bg-gray-600 dark:hover:shadow-sm flex items-center justify-center overflow-hidden"
              aria-label={brand.label || 'Brand slot'}
            >
              {brand.image && (
                <img src={brand.image} alt={brand.label} className="h-full w-full object-cover p-0 transition-transform duration-200 hover:scale-105" />
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default NavLinks
