import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { BsCartFill, BsMessenger, BsSunFill, BsMoonStarsFill } from 'react-icons/bs'
import { FaUser } from "react-icons/fa";
import LoginModal from './LoginModal'
import SignupModal from './SignupModal'
import supabase from '../lib/supabase'
import { useShop } from '../context/ShopContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// the main navbar that sticks to the top of every page
// handles user auth state, theme toggling, cart badge, and the login/signup modals
function Navbar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isSignupOpen, setIsSignupOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [theme, setTheme] = useState('light')
  const [isCartPinging, setIsCartPinging] = useState(false)
  const { cartCount, lastAddedAt, setOpenLoginFn } = useShop()

  // grabs the first letter of the user's name or email for the profile circle
  const getInitial = () => {
    if (!user) return "?"

    const firstName = user.user_metadata?.first_name
    if (firstName) return firstName.charAt(0).toUpperCase()

    if (user.email) return user.email.charAt(0).toUpperCase()

    return "?"
  }

  // checks the backend for the user's role (admin or regular user)
  // saves it to localStorage so the admin link shows up instantly on reload
  async function fetchRole(session) {
    if (!session) {
      setIsAdmin(false)
      localStorage.removeItem("role")
      return
    }

    try {
      const res = await fetch(`${API_BASE}/me/role`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!res.ok) throw new Error()

      const { role } = await res.json()

      setIsAdmin(role === 'admin')

      localStorage.setItem("role", role)

    } catch {
      setIsAdmin(false)
    }
  }

  // applies the selected theme to the whole document
  // data-theme is for daisyui and dark class is for tailwind dark variants
  function applyTheme(nextTheme) {
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.classList.toggle('dark', nextTheme === 'dark')
    localStorage.setItem('theme', nextTheme)
    setTheme(nextTheme)
  }

  // runs once on mount to set up auth, theme, and register the login opener
  useEffect(() => {
    // load role from storage first so the admin link shows up right away
    const savedRole = localStorage.getItem("role")
    if (savedRole === "admin") {
      setIsAdmin(true)
    }

    // load saved theme or fall back to the system preference
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      applyTheme(savedTheme)
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark ? 'dark' : 'light')
    }

    // hand ShopContext a function that opens the login modal
    // this lets the cart system pop the login when a guest tries to add something
    setOpenLoginFn(() => setIsLoginOpen(true))

    // grab the current session and start listening for auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      fetchRole(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      fetchRole(session)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // closes the profile dropdown when clicking anywhere outside of it
  useEffect(() => {
    if (!isDropdownOpen) return
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDropdownOpen])

  // triggers the ping animation on the cart icon whenever something gets added
  // the animation runs for 1.3 seconds then stops
  useEffect(() => {
    if (!lastAddedAt) return
    setIsCartPinging(true)
    const timer = setTimeout(() => setIsCartPinging(false), 1300)
    return () => clearTimeout(timer)
  }, [lastAddedAt])

  // close the modal after a successful login or signup
  function onLoginSuccess() {
    setIsLoginOpen(false)
  }

  function onSignupSuccess() {
    setIsSignupOpen(false)
  }

  // signs the user out, clears their role, and sends them back to the homepage
  async function handleLogout() {
    await supabase.auth.signOut()

    setUser(null)
    setIsAdmin(false)

    localStorage.removeItem("role")

    setIsDropdownOpen(false)
    navigate('/')
  }

  // placeholder for search, will hook up to a search route later
  function onSearchSubmit(e) {
    e.preventDefault()
    console.log(query)
  }

  // flips between light and dark mode
  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="bg-[#0b2e59] shadow-md sticky top-0 z-[9999]">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">

        {/* logo that links back to the homepage */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="logo/logo-whiskers.png" alt="Whiskers" className="h-12 w-auto" />
        </Link>

        {/* search bar, hidden on mobile */}
        <form onSubmit={onSearchSubmit} className="flex-1 hidden md:flex">
          <div className="flex w-full max-w-2xl mx-auto">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search over 500 Pet products..."
              className="w-full h-11 px-5 rounded-l-full bg-white text-gray-800 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              className="h-11 px-6 rounded-r-full bg-blue-700 text-white font-semibold hover:bg-blue-800 transition"
            >
              Search
            </button>
          </div>
        </form>

        {/* right side icons and controls */}
        <div className="ml-auto flex items-center gap-4">

          <nav className="hidden md:flex items-center gap-2">
          </nav>

          {/* messenger icon */}
          <NavLink to="/chat" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <BsMessenger className="text-white w-6 h-6" />
          </NavLink>

          {/* profile button and dropdown */}
          {/* if the user is logged in, show their initial and a dropdown with profile links */}
          {/* if not logged in, show a generic user icon with sign in / sign up options */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen((v) => !v)}
                className="w-10 h-10 rounded-full bg-yellow-400 text-[#0b2e59] flex items-center justify-center font-bold"
              >
                {getInitial()}
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 z-[9999]">
                  <Link to="/profile" className="block px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 hover:rounded-t-xl">Profile</Link>
                  <Link to="/orders" className="block px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">Orders</Link>
                  <Link to="/addresses" className="block px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">Addresses</Link>

                  {isAdmin && (
                    <Link to="/admin" className="block px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                      Admin Panel
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:rounded-b-xl"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen((v) => !v)}
                className="w-10 h-10 rounded-full bg-yellow-400 text-[#0b2e59] flex items-center justify-center font-bold"
              >
                <FaUser className="text-white w-6 h-6" />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 z-[9999]">
                  <Link onClick={() => { setIsLoginOpen(true); setIsDropdownOpen(false) }} className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 hover:rounded-t-xl text-gray-900 dark:text-gray-100">Sign In</Link>
                  <Link onClick={() => { setIsSignupOpen(true); setIsDropdownOpen(false) }} className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 hover:rounded-b-xl text-gray-900 dark:text-gray-100">Sign Up</Link>
                </div>
              )}
            </div>
          )}

          {/* cart icon with badge showing how many items are in the cart */}
          {/* the ping animation plays for a bit whenever a new item gets added */}
          <NavLink
            to="/cart"
            className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <BsCartFill className="text-white w-5 h-5" />
            {cartCount > 0 && (
              <>
                <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-bold text-[#0b2e59]">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
                {isCartPinging && (
                  <span className="absolute -right-1 -top-1 h-[18px] w-[18px] rounded-full bg-yellow-300/80 animate-ping" />
                )}
              </>
            )}
          </NavLink>

          {/* theme toggle pill that slides between sun (light) and moon (dark) */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`relative flex h-8 w-16 items-center rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-300/70 ${theme === 'dark' ? 'bg-slate-600' : 'bg-yellow-300'}`}
            aria-label="Toggle light and dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ${theme === 'dark' ? 'translate-x-8' : 'translate-x-0'}`}
            >
              {theme === 'dark'
                ? <BsMoonStarsFill className="h-3.5 w-3.5 text-slate-700" />
                : <BsSunFill className="h-3.5 w-3.5 text-yellow-500" />
              }
            </span>
          </button>
        </div>
      </div>

      {/* login and signup modals, controlled by state above */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToSignup={() => setIsSignupOpen(true)}
        onLoginSuccess={onLoginSuccess}
      />

      <SignupModal
        isOpen={isSignupOpen}
        onClose={() => setIsSignupOpen(false)}
        onSwitchToLogin={() => setIsLoginOpen(true)}
        onSignupSuccess={onSignupSuccess}
      />
    </header>
  )
}

export default Navbar
