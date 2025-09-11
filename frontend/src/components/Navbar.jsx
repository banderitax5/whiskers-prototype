import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { BsCartFill } from 'react-icons/bs'

function Navbar() {
  const [query, setQuery] = useState('')

  function onSearchSubmit(e) {
    e.preventDefault()
    // TODO: wire to search route/action later
    // For now, no-op
  }

  return (
    <header className="bg-[#0b2e59]">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo-whiskers.png" alt="Whiskers" className="h-13 w-auto hidden sm:block" />
          <span className="text-white font-bold sm:hidden">Whiskers</span>
        </Link>

        <form onSubmit={onSearchSubmit} role="search" className="flex-1">
          <div className="relative max-w-xl">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search over 500 Pet products..."
              className="w-full rounded-full bg-white text-gray-900 placeholder-gray-500 h-10 pl-5 pr-12 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 top-1 h-8 w-8 rounded-full bg-white text-gray-600 hover:bg-gray-100 grid place-items-center border"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </div>
        </form>

        <nav className="hidden md:flex items-center gap-3">
          <NavLink
            to="/brands"
            className="h-8 px-4 grid place-items-center rounded-md bg-[#1f4db8] text-white hover:bg-[#2b63e3]"
          >
            Brands
          </NavLink>
          <NavLink
            to="/deals"
            className="h-8 px-4 grid place-items-center rounded-md bg-[#1f4db8] text-white hover:bg-[#2b63e3]"
          >
            Deals
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <NavLink to="/login" className="text-white/90  hover:text-white font-semibold">LOG IN</NavLink>
          <NavLink
            to="/signup"
            className="h-8 px-4 grid place-items-center rounded-full bg-[#ffd21e] text-black font-semibold hover:brightness-95"
          >
            SIGN UP
          </NavLink>
          <NavLink 
            to="/cart" 
            className="flex items-center justify-center w-12 h-12 transition-transform hover:scale-105"
          >
            <span className="sr-only">Cart</span>
            <BsCartFill className="w-5 h-5 text-white hover:brightness-90 outline-8 ring-white" />
          </NavLink>
        </div>
      </div>
    </header>
  )
}

export default Navbar


