import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { BsCartFill, BsMessenger, BsSunFill, BsMoonStarsFill } from 'react-icons/bs'
import { FaUser } from "react-icons/fa";
import LoginModal from './LoginModal'
import SignupModal from './SignupModal'
import supabase from '../lib/supabase'
import { useShop } from '../context/ShopContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

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
  const { cartCount, lastAddedAt } = useShop()

  // ✅ GET USER INITIAL (same as admin layout)
  const getInitial = () => {
    if (!user) return "?"

    const firstName = user.user_metadata?.first_name
    if (firstName) return firstName.charAt(0).toUpperCase()

    if (user.email) return user.email.charAt(0).toUpperCase()

    return "?"
  }

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

      //  SAVE ROLE
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

  useEffect(() => {
    // LOAD ROLE FROM STORAGE FIRST (instant UI)
    const savedRole = localStorage.getItem("role")
    if (savedRole === "admin") {
      setIsAdmin(true)
    }

    // load saved theme once on mount
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      applyTheme(savedTheme)
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark ? 'dark' : 'light')
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      fetchRole(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      fetchRole(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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

    // CLEAR ROLE
    localStorage.removeItem("role")

    setIsDropdownOpen(false)
    navigate('/')
  }

  // placeholder for search - will hook up to a search route later
  function onSearchSubmit(e) {
    e.preventDefault()
    console.log(query)
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="bg-[#0b2e59] shadow-md sticky top-0 z-[9999]">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">

        {/* LOGO */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="logo/logo-whiskers.png" alt="Whiskers" className="h-12 w-auto" />
        </Link>

        {/* SEARCH */}
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

        {/* RIGHT SIDE */}
        <div className="ml-auto flex items-center gap-4">

          {/* NAV BUTTONS */}
          <nav className="hidden md:flex items-center gap-2">
          </nav>
          <NavLink to="/chat" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <BsMessenger className="text-white w-6 h-6" />
          </NavLink>
          {/* PROFILE / AUTH */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen((v) => !v)}
                className="w-10 h-10 rounded-full bg-yellow-400 text-[#0b2e59] flex items-center justify-center font-bold"
              >
                {getInitial()}
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border z-[9999]">
                  <Link to="/profile" className="block px-4 py-2 hover:bg-gray-100 hover:rounded-t-xl">Profile</Link>
                  <Link to="/orders" className="block px-4 py-2 hover:bg-gray-100">Orders</Link>
                  <Link to="/addresses" className="block px-4 py-2 hover:bg-gray-100">Addresses</Link>

                  {isAdmin && (
                    <Link to="/admin" className="block px-4 py-2 text-red-600 hover:bg-red-50">
                      Admin Panel
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 hover:rounded-b-xl"
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
                <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border z-[9999]">
                  <Link onClick={() => { setIsLoginOpen(true); setIsDropdownOpen(false) }} className="block px-4 py-2 hover:bg-gray-100 hover:rounded-t-xl">Sign In</Link>
                  <Link onClick={() => { setIsSignupOpen(true); setIsDropdownOpen(false) }} className="block px-4 py-2 hover:bg-gray-100 hover: rounded-b-xl">Sign Up</Link>
                </div>
              )}
            </div>
          )}

          {/* CART */}
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

          {/* theme toggle - minimal pill with sliding knob */}
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

      {/* MODALS */}
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
