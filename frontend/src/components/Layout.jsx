import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import NavLinks from './NavLinks.jsx'
import Footer from './Footer.jsx'
import FloatingNotification from './Toaster.jsx'
import ScrollProgress from './ScrollProgress.jsx'
import BackToTop from './BackToTop.jsx'
import FloatingContact from './FloatingContact.jsx'
import CookieBanner from './CookieBanner.jsx'
import SkipToContent from './SkipToContent.jsx'
import RecoveryGate from './RecoveryGate.jsx'
import { captureUtmParams, trackEvent } from '../lib/appEvents.js'

function Layout() {
  const location = useLocation()

  // capture UTM params once on first load
  useEffect(() => { captureUtmParams() }, [])

  // track page views on route change
  useEffect(() => {
    trackEvent('page_view', { path: location.pathname })
  }, [location.pathname])
  const showNavLinks = location.pathname !== '/profile' &&
                       location.pathname !== '/orders' &&
                       location.pathname !== '/addresses' &&
                       location.pathname !== '/pets'

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <SkipToContent />
      <RecoveryGate />
      <ScrollProgress />
      <Navbar />
      {showNavLinks && <NavLinks />}
      <FloatingNotification />
      <main id="main-content" className="flex-1 px-3 sm:px-4 py-4 sm:py-6">
        <Outlet />
      </main>
      <Footer />
      <BackToTop />
      <FloatingContact />
      <CookieBanner />
    </div>
  )
}

export default Layout
