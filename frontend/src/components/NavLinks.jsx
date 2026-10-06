import React from 'react'
import { Link } from 'react-router-dom'
import { FaStore, FaCat, FaDog, FaFish, FaCookieBite, FaWater, FaPaw } from 'react-icons/fa'

// pennant/flag shape: flat left edge, pointed right tail
const FLAG_CLIP = 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)'

const placeholderLinks = [
  { label: 'Menu', to: '/menu', icon: FaStore, color: '#3b82f6' },
  { label: 'Cats', to: '/menu?category=Cats', icon: FaCat, color: '#0ea5e9' },
  { label: 'Dogs', to: '/menu?category=Dogs', icon: FaDog, color: '#f59e0b' },
  { label: 'Fish', to: '/menu?category=Fish', icon: FaFish, color: '#06b6d4' },
  { label: 'Dry Food', to: '/menu?category=Dogs - DRY', icon: FaCookieBite, color: '#ea580c' },
  { label: 'Wet Food', to: '/menu?category=Wet Food', icon: FaWater, color: '#0d9488' },
  { label: 'Pet Recommendation', to: '/pets', icon: FaPaw, color: '#e11d48' },
]

const brands = [
  { key: 'royal', image: '/brands/ROYAL.webp', label: 'Royal Canin' },
  { key: 'pedigree', image: '/brands/pedigree.png', label: 'Pedigree' },
  { key: 'vitality', image: '/brands/vitality.png', label: 'Vitality' },
  { key: 'topbreed', image: '/brands/topbreed.png', label: 'Top Breed' },
  { key: 'special', image: '/brands/special.png', label: 'Special' },
  { key: 'cesar', image: '/brands/cesar.png', label: 'Cesar' },
  { key: 'majesty', image: '/brands/majesty.jpg', label: 'Majesty' },
  { key: 'alphapro', image: '/brands/alphapro.jpg', label: 'Alpha Pro' },
]

function NavLinks() {
  return (
    <div className="bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      <div className="px-3 sm:px-4 lg:mx-auto lg:max-w-7xl">
        <nav
          className="flex w-full flex-wrap items-center justify-between gap-x-1 gap-y-2 py-3 sm:gap-x-2 lg:flex-nowrap md:py-3.5"
          aria-label="Category links"
        >
          {placeholderLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                to={item.to}
                style={{
                  '--flag': item.color,
                  '--flag-soft': `${item.color}1f`,
                  '--flag-soft-dark': `${item.color}38`,
                  clipPath: FLAG_CLIP,
                }}
                className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--flag-soft)] pl-2.5 pr-4 py-1.5 text-xs font-semibold text-gray-700 transition-all duration-200 hover:bg-[var(--flag)] hover:text-white focus:outline-none focus-visible:bg-[var(--flag)] focus-visible:text-white dark:bg-[var(--flag-soft-dark)] dark:text-gray-200 dark:hover:text-white sm:pl-3 sm:pr-5 sm:text-sm lg:grow"
              >
                <Icon
                  aria-hidden="true"
                  className="hidden h-3.5 w-3.5 shrink-0 text-[var(--flag)] transition-colors duration-200 group-hover:text-white group-focus-visible:text-white sm:block"
                />
                {item.label}
              </Link>
            )
          })}
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
