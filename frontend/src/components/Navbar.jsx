import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { BsCartFill, BsMessenger, BsSunFill, BsMoonStarsFill, BsList, BsXLg, BsEnvelope, BsHeart } from 'react-icons/bs'
import { FaUser } from "react-icons/fa";
import LoginModal from './LoginModal'
import SignupModal from './SignupModal'
import SearchSuggestions from './SearchSuggestions'
import MobileSearch from './MobileSearch'
import supabase from '../lib/supabase'
import { useShop } from '../context/ShopContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function Navbar() {
  const navigate = useNavigate()
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isSignupOpen, setIsSignupOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropdownRef = useRef(null)
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [panelRole, setPanelRole] = useState('user')
  const [theme, setTheme] = useState('light')
  const [isCartPinging, setIsCartPinging] = useState(false)
  const { cartCount, lastAddedAt, setOpenLoginFn } = useShop()

  const getInitial = () => {
    if (!user) return "?"
    const firstName = user.user_metadata?.first_name
    if (firstName) return firstName.charAt(0).toUpperCase()
    if (user.email) return user.email.charAt(0).toUpperCase()
    return "?"
  }

  const roleCheckedRef = useRef(false)

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
      setIsAdmin(role === 'admin' || role === 'staff')
      setPanelRole(role)
      localStorage.setItem("role", role)
      return true
    } catch {
      return false
    }
  }

  function applyTheme(nextTheme) {
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.classList.toggle('dark', nextTheme === 'dark')
    localStorage.setItem('theme', nextTheme)
    setTheme(nextTheme)
  }

  useEffect(() => {
    const savedRole = localStorage.getItem("role")
    if (savedRole === "admin" || savedRole === "staff") {
      setIsAdmin(true)
      setPanelRole(savedRole)
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        roleCheckedRef.current = false
        setIsAdmin(false)
        localStorage.removeItem("role")
        return
      }
      if (event === 'SIGNED_IN') roleCheckedRef.current = false
      if (!roleCheckedRef.current) {
        fetchRole(session.access_token).then((ok) => {
          if (ok) roleCheckedRef.current = true
        })
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function onLoginSuccess() { setIsLoginOpen(false) }
  function onSignupSuccess() { setIsSignupOpen(false) }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    localStorage.removeItem("role")
    setIsDropdownOpen(false)
    setMobileMenuOpen(false)
    navigate('/')
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="bg-[#0b2e59] dark:bg-gray-900 shadow-md sticky top-0 z-[9999]">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 lg:mx-auto lg:max-w-7xl">
        <div className="flex items-center gap-2 sm:gap-3 w-full">

          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo/logo-whiskers.png" alt="Whiskers" className="h-10 sm:h-12 w-auto" />
          </Link>

          <SearchSuggestions className="flex-1" />
          <MobileSearch />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">

          <NavLink to="/support" aria-label="Support" className="hidden sm:flex w-9 h-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 transition">
            <BsMessenger className="text-white w-5 h-5" />
          </NavLink>

          {/* Desktop: user dropdown */}
          <div className="hidden sm:block relative" ref={dropdownRef}>
            {user ? (
              <>
                <button
                  onClick={() => setIsDropdownOpen((v) => !v)}
                  aria-label="Your account"
                  aria-haspopup="menu"
                  aria-expanded={isDropdownOpen}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-yellow-400 text-[#0b2e59] dark:bg-yellow-300 dark:text-gray-900 flex items-center justify-center font-bold hover:ring-2 hover:ring-yellow-300/50 transition-all duration-200"
                >
                  {getInitial()}
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 z-[9999] overflow-hidden">
                    <Link to="/profile" className="block px-4 py-2.5 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Profile</Link>
                    <Link to="/orders" className="block px-4 py-2.5 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Orders</Link>
                    <Link to="/pets" className="block px-4 py-2.5 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Pets</Link>
                    {isAdmin && (
                      <Link to="/admin" className="block px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">{panelRole === 'staff' ? 'Staff Panel' : 'Admin Panel'}</Link>
                    )}
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">Logout</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsDropdownOpen((v) => !v)}
                  aria-label="Sign in or create an account"
                  aria-haspopup="menu"
                  aria-expanded={isDropdownOpen}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-yellow-400 text-[#0b2e59] dark:bg-yellow-300 dark:text-gray-900 flex items-center justify-center font-bold hover:ring-2 hover:ring-yellow-300/50 transition-all duration-200"
                >
                  <FaUser className="text-white w-5 h-5" />
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 z-[9999] overflow-hidden">
                    <button onClick={() => { setIsLoginOpen(true); setIsDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors">Sign In</button>
                    <button onClick={() => { setIsSignupOpen(true); setIsDropdownOpen(false) }} className="w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors">Sign Up</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Desktop: cart */}
          <NavLink
            to="/cart"
            aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ''}`}
            className="hidden sm:flex relative w-9 h-9 sm:w-10 sm:h-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 transition"
          >
            <BsCartFill className="text-white w-4 h-4 sm:w-5 sm:h-5" />
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

          {/* Desktop: theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`hidden sm:flex relative h-7 w-14 sm:h-8 sm:w-16 items-center rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-300/70 ${theme === 'dark' ? 'bg-slate-600' : 'bg-yellow-300'}`}
          >
            <span
              className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ${theme === 'dark' ? 'translate-x-7 sm:translate-x-8' : 'translate-x-0'}`}
            >
              {theme === 'dark'
                ? <BsMoonStarsFill className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-700" />
                : <BsSunFill className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-yellow-500" />
              }
            </span>
          </button>

          {/* Mobile: hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="sm:hidden w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 transition"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <BsXLg className="text-white w-4 h-4" /> : <BsList className="text-white w-4 h-4" />}
          </button>
        </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-white/10 bg-[#0b2e59] dark:bg-gray-900 px-4 py-3 space-y-1">
          <NavLink to="/cart" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium">
            <BsCartFill className="w-4 h-4" />
            Cart {cartCount > 0 && <span className="text-yellow-300">({cartCount})</span>}
          </NavLink>

          <NavLink to="/pets" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium">
            <BsHeart className="w-4 h-4" />
            Pet Recommendation
          </NavLink>

          <NavLink to="/support" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium">
            <BsEnvelope className="w-4 h-4" />
            Support
          </NavLink>

          <div className="flex items-center gap-2 px-3 py-2 text-white/90 text-sm font-medium">
            <span>Theme</span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`relative flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-600' : 'bg-yellow-300'}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}
              >
                {theme === 'dark'
                  ? <BsMoonStarsFill className="h-2.5 w-2.5 text-slate-700" />
                  : <BsSunFill className="h-2.5 w-2.5 text-yellow-500" />
                }
              </span>
            </button>
          </div>

          {!user && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <button onClick={() => { setIsLoginOpen(true); setMobileMenuOpen(false) }} className="w-full text-left px-3 py-2 rounded-lg text-yellow-300 hover:bg-white/10 transition text-sm font-medium">Sign In</button>
              <button onClick={() => { setIsSignupOpen(true); setMobileMenuOpen(false) }} className="w-full text-left px-3 py-2 rounded-lg text-yellow-300 hover:bg-white/10 transition text-sm font-medium">Sign Up</button>
            </div>
          )}
          {user && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium">Profile</Link>
              <Link to="/orders" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium">Orders</Link>
              {isAdmin && (
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-lg text-red-400 hover:bg-white/10 transition text-sm font-medium">{panelRole === 'staff' ? 'Staff Panel' : 'Admin Panel'}</Link>
              )}
              <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-red-400 hover:bg-white/10 transition text-sm font-medium">Logout</button>
            </div>
          )}
        </div>
      )}

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
