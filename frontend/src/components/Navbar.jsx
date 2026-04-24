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

  // tracks whether we already checked the role for the current session
  // prevents duplicate /me/role calls when multiple auth events fire on load
  const roleCheckedRef = useRef(false)

  // checks the backend for the user's role (admin or regular user)
  // saves it to localStorage so the admin link shows up instantly on reload
  // returns true on success so the caller knows whether to mark the role as checked
  // returns false on failure so the next auth event can retry with a fresh token
  async function fetchRole(token) {
    if (!token) {
      setIsAdmin(false)
      localStorage.removeItem("role")
      return false
    }

    try {
      const res = await fetch(`${API_BASE}/me/role`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) return false

      const { role } = await res.json()

      setIsAdmin(role === 'admin')

      localStorage.setItem("role", role)

      return true
    } catch {
      return false
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
    const savedRole = localStorage.getItem("role")
    if (savedRole === "admin") {
      setIsAdmin(true)
    }

    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      applyTheme(savedTheme)
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark ? 'dark' : 'light')
    }

    setOpenLoginFn(() => setIsLoginOpen(true))

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    // the role is checked once per session, the flag is only set after a successful
    // fetch so that if the first event carries a revoked token (401) the next event
    // with a refreshed token will retry instead of being skipped
    // on SIGNED_IN the flag resets so a fresh login always rechecks the role
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        roleCheckedRef.current = false
        setIsAdmin(false)
        localStorage.removeItem("role")
        return
      }
      if (event === 'SIGNED_IN') {
        roleCheckedRef.current = false
      }
      if (!roleCheckedRef.current) {
        fetchRole(session.access_token).then((ok) => {
          if (ok) roleCheckedRef.current = true
        })
      }
    })

    return () => subscription.unsubscribe()
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
  useEffect(() => {
    if (!lastAddedAt) return
    setIsCartPinging(true)
    const timer = setTimeout(() => setIsCartPinging(false), 1300)
    return () => clearTimeout(timer)
  }, [lastAddedAt])

  function onLoginSuccess() {
    setIsLoginOpen(false)
  }

  function onSignupSuccess() {
    setIsSignupOpen(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    localStorage.removeItem("role")
    setIsDropdownOpen(false)
    navigate('/')
  }

  function onSearchSubmit(e) {
    e.preventDefault()
    console.log(query)
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="bg-[#0b2e59] dark:bg-gray-900 shadow-md sticky top-0 z-[9999]">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">

        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="logo/logo-whiskers.png" alt="Whiskers" className="h-12 w-auto" />
        </Link>

        <form onSubmit={onSearchSubmit} className="flex-1 hidden md:flex">
          <div className="flex w-full max-w-2xl mx-auto">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search over 500 Pet products..."
              className="w-full h-11 px-5 rounded-l-full bg-white text-gray-800 placeholder-gray-400 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              className="h-11 px-6 rounded-r-full bg-blue-700 text-white font-semibold hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 transition"
            >
              Search
            </button>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-4">

          <NavLink to="/chat" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10">
            <BsMessenger className="text-white w-6 h-6" />
          </NavLink>

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen((v) => !v)}
                className="w-10 h-10 rounded-full bg-yellow-400 text-[#0b2e59] dark:bg-yellow-300 dark:text-gray-900 flex items-center justify-center font-bold"
              >
                {getInitial()}
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 z-[9999]">
                  <Link to="/profile" className="block px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 hover:rounded-t-xl">Profile</Link>
                  <Link to="/orders" className="block px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">Orders</Link>
                  <Link to="/pets" className="block px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">Pets</Link>

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
                className="w-10 h-10 rounded-full bg-yellow-400 text-[#0b2e59] dark:bg-yellow-300 dark:text-gray-900 flex items-center justify-center font-bold"
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

          <NavLink
            to="/cart"
            className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10"
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

          <button
            type="button"
            onClick={toggleTheme}
            className={`relative flex h-8 w-16 items-center rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-300/70 ${theme === 'dark' ? 'bg-slate-600' : 'bg-yellow-300'}`}
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
