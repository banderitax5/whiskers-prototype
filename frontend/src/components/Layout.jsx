import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import NavLinks from './NavLinks.jsx'
import Footer from './Footer.jsx'
import FloatingNotification from './Toaster.jsx'
import AuthNotice from './AuthNotice.jsx'
import ScrollProgress from './ScrollProgress.jsx'
import BackToTop from './BackToTop.jsx'
import FloatingContact from './FloatingContact.jsx'
import CookieBanner from './CookieBanner.jsx'
import SkipToContent from './SkipToContent.jsx'
import RecoveryGate from './RecoveryGate.jsx'
import AnnouncementBar from './AnnouncementBar.jsx'
import PromoStrip from './PromoStrip.jsx'
import { captureUtmParams, trackEvent } from '../lib/appEvents.js'
import { fetchSiteContent, contentSettings } from '../lib/siteContent.js'
import supabase from '../lib/supabase'

// maintenance mode (Phase 6): shoppers see a closed message instead of the
// shop, but the navbar stays so the owner can sign in (an admin session
// bypasses the gate). The role probe is best effort - on failure we keep the
// shop open rather than lock the owner out of their own site.
async function fetchIsAdmin() {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return false
    const res = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}/me/role`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const body = await res.json()
    return body?.role === 'admin'
  } catch {
    return false
  }
}

function Layout() {
  const location = useLocation()
  const [maintenance, setMaintenance] = useState(null) // null = not loaded yet
  const [isAdmin, setIsAdmin] = useState(false)

  // capture UTM params once on first load
  useEffect(() => { captureUtmParams() }, [])

  // track page views on route change
  useEffect(() => {
    trackEvent('page_view', { path: location.pathname })
  }, [location.pathname])

  // maintenance flag + admin bypass; re-checked on route change so a sign-in
  // during maintenance unlocks the shop without a manual refresh
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSiteContent(), fetchIsAdmin()]).then(([content, admin]) => {
      if (cancelled) return
      setMaintenance(contentSettings(content).maintenance || { enabled: false, message: '' })
      setIsAdmin(admin)
    })
    return () => { cancelled = true }
  }, [location.pathname])

  const showNavLinks = !['/profile', '/orders', '/addresses', '/pets'].some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
  )
  const shopClosed = Boolean(maintenance?.enabled) && !isAdmin

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <SkipToContent />
      <RecoveryGate />
      <ScrollProgress />
      <AnnouncementBar />
      <Navbar />
      {showNavLinks && <NavLinks />}
      <PromoStrip />
      <FloatingNotification />
      <AuthNotice />

      <main id="main-content" className="flex-1 px-3 sm:px-4 py-4 sm:py-6">
        {shopClosed ? (
          <div className="mx-auto max-w-xl text-center py-16 sm:py-24 space-y-4" role="alert">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">We&#39;ll be back soon</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-slate-300">
              {maintenance?.message || 'Our online store is closed for maintenance. Please check back shortly.'}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Store staff: sign in from the menu above to continue working.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <Footer />
      <BackToTop />
      <FloatingContact />
      <CookieBanner />
    </div>
  )
}

export default Layout
