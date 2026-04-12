import React from 'react'
import { Link } from 'react-router-dom'

// sits under the main navbar. uses the same max width and horizontal padding as Navbar
// so the link row and brand row line up with the logo on the left and cart on the right
function NavLinks() {
  const placeholderLinks = [
    { label: 'Menu', to: '/menu' },
    { label: 'Placeholder1', to: '#' },
    { label: 'Placeholder2', to: '#' },
    { label: 'Placeholder3', to: '#' },
    { label: 'Placeholder4', to: '#' },
    { label: 'Placeholder5', to: '#' },
    { label: 'Placeholder6', to: '#' },
  ]

  // each slot links to home with a brand query param. Home or a future shop page can read
  // useSearchParams and filter products by brand when you wire real slugs or ids
  const brandPlaceholders = Array.from({ length: 8 }, (_, i) => ({
    key: `brand-slot-${i}`,
    to: `/?brand=${i + 1}`,
    ariaLabel: `Popular brand ${i + 1} placeholder`,
  }))

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4">
        <nav
          className="flex w-full flex-wrap items-center justify-between gap-x-1 gap-y-2 py-3 sm:gap-x-2 md:flex-nowrap md:py-3.5"
          aria-label="Category links"
        >
          {placeholderLinks.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="text-center text-xs font-medium text-gray-700 hover:text-[#0b2e59] transition-colors sm:text-sm"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* brand tiles are links so each can navigate to a filtered product list later */}
        <div
          className="flex w-full items-stretch gap-2 pb-2 sm:gap-3 sm:pb-5"
          aria-label="Popular brands"
        >
          {brandPlaceholders.map((slot) => (
            <Link
              key={slot.key}
              to={slot.to}
              className="h-10 min-h-[2.5rem] min-w-0 flex-1 cursor-pointer rounded-lg bg-gray-200 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0b2e59] focus:ring-offset-2 sm:h-12 md:h-14"
              aria-label={slot.ariaLabel}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default NavLinks
