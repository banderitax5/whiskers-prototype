import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef, useContext } from 'react'
import Layout from './components/Layout.jsx'
import MfaVerifyGate from './components/MfaVerifyGate.jsx'
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx'
import { RoleContext } from './context/RoleContext.js'
import { useShop } from './context/ShopContext.jsx'

import supabase from './lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// redirects to home if the user is not logged in, with a toast explaining
// why (no silent fallback - guests always learn they need to sign in)
function RequireAuth({ children, message }) {
  const [session, setSession] = useState(undefined)
  const { pushNotification } = useShop()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s))

    return () => subscription.unsubscribe()
  }, [])

  // one toast per rejected visit, fired from an effect (never during render)
  const notifiedRef = useRef(false)
  useEffect(() => {
    if (session === null && !notifiedRef.current) {
      notifiedRef.current = true
      pushNotification(message || 'Please sign in to view this page.', 'info')
    }
    if (session) notifiedRef.current = false
  }, [session, message, pushNotification])

  if (session === undefined) return null
  if (!session) return <Navigate to="/" replace />

  return children
}

// checks the user's role via the backend and only renders children for
// staff or admin; provides the role to the back-office tree so the sidebar
// and pages can hide admin-only destinations
// uses a checked flag that is only set after a successful call so that
// if the first auth event carries a revoked token the next event retries
function RequireAdmin({ children }) {
  const [state, setState] = useState('loading')
  const [role, setRole] = useState('user')
  const checkedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timer

    async function checkAdmin(token, attempt = 0) {
      if (!token || cancelled) return
      try {
        const res = await fetch(`${API_BASE}/me/role`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (!res.ok) {
          // 401/403 mean the token is bad — send them home without retrying
          if (res.status === 401 || res.status === 403) {
            checkedRef.current = true
            setState('denied')
            return
          }
          throw new Error(`role check failed: ${res.status}`)
        }
        const { role, mfaVerified } = await res.json()
        if (cancelled) return
        checkedRef.current = true
        setRole(role)
        if (role !== 'admin' && role !== 'staff') {
          setState('denied')
        } else if (mfaVerified === false) {
          setState('mfa-verify')
        } else {
          setState('allowed')
        }
      } catch {
        if (cancelled) return
        // network or transient failure — retry up to 3 times with backoff
        // so a flaky first load does not dump the admin on a blank page
        if (attempt < 2) {
          timer = setTimeout(() => checkAdmin(token, attempt + 1), 800 * (attempt + 1))
        } else {
          setState('error')
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) {
        checkedRef.current = false
        setState('denied')
        return
      }
      if (!checkedRef.current) {
        checkAdmin(s.access_token)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-yellow-500" aria-hidden="true" />
          <p className="text-sm">Checking access…</p>
        </div>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow dark:border-red-800 dark:bg-gray-800">
          <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Could not verify your access</h1>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            We could not reach the server to check your role. Check your connection and refresh the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-yellow-500 px-4 py-2 text-sm font-medium text-[#0b2e59] hover:bg-yellow-400"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
  if (state === 'mfa-verify') {
    return <MfaVerifyGate onVerified={() => setState('allowed')} />
  }
  if (state === 'denied') return <Navigate to="/" replace />

  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

// renders children only when the signed-in role matches, otherwise
// sends staff back to their default landing page instead of a 403 wall
function RequireRole({ role, fallback, children }) {
  const current = useContext(RoleContext)
  if (current !== role) return <Navigate to={fallback} replace />
  return children
}

const routeLazy = (load, wrap) => async () => {
  const { default: Page } = await load()
  return wrap ? { element: wrap(<Page />) } : { Component: Page }
}

const authRoute = (load) => routeLazy(load, (page) => <RequireAuth>{page}</RequireAuth>)
const adminRoute = (load) => routeLazy(load, (page) => <RequireRole role="admin" fallback="/admin/orders">{page}</RequireRole>)

// ROUTES
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorBoundary />,
    HydrateFallback: FoodBowlLoader,
    children: [
      { index: true, lazy: routeLazy(() => import('./pages/Home.jsx')) },
      { path: 'menu', lazy: routeLazy(() => import('./pages/Menu.jsx')) },
      { path: 'products/:prod_id', lazy: routeLazy(() => import('./pages/ProductDetail.jsx')) },
      { path: 'cart', lazy: routeLazy(() => import('./pages/Cart.jsx')) },
      { path: 'checkout', lazy: routeLazy(() => import('./pages/Checkout.jsx')) },
      { path: 'pay/simulate', lazy: authRoute(() => import('./pages/PaymentSimulate.jsx')) },
      { path: 'orders', lazy: authRoute(() => import('./pages/UserOrders.jsx')) },
      { path: 'orders/:orderId', lazy: authRoute(() => import('./pages/OrderConfirmation.jsx')) },
      { path: 'about', lazy: routeLazy(() => import('./pages/About.jsx')) },
      { path: 'policies/:slug', lazy: routeLazy(() => import('./pages/PolicyPage.jsx')) },
      { path: 'pets', lazy: authRoute(() => import('./pages/Pets.jsx')) },
      { path: 'profile', lazy: authRoute(() => import('./pages/Profile.jsx')) },
      { path: 'support', lazy: routeLazy(() => import('./pages/Support.jsx')) },
      { path: 'reset', lazy: routeLazy(() => import('./pages/ResetPassword.jsx')) },
      { path: 'help/lost-authenticator', lazy: routeLazy(() => import('./pages/LostAuthenticator.jsx')) },
    ],
  },

  {
    path: '/admin',
    lazy: routeLazy(() => import('./components/AdminLayout.jsx'), (page) => <RequireAdmin>{page}</RequireAdmin>),
    errorElement: <RouteErrorBoundary />,
    HydrateFallback: FoodBowlLoader,
    children: [
      { index: true, lazy: adminRoute(() => import('./components/AdminDashboard.jsx')) },
      { path: 'products', lazy: routeLazy(() => import('./components/AdminProductManagement.jsx')) },
      { path: 'customers', lazy: adminRoute(() => import('./components/AdminCustomers.jsx')) },
      { path: 'orders', lazy: routeLazy(() => import('./components/AdminOrders.jsx')) },
      { path: 'payments', lazy: routeLazy(() => import('./components/AdminPayments.jsx')) },
      { path: 'promos', lazy: adminRoute(() => import('./components/AdminPromos.jsx')) },
      { path: 'media', lazy: adminRoute(() => import('./components/AdminMedia.jsx')) },
      { path: 'banners', lazy: adminRoute(() => import('./components/AdminBanners.jsx')) },
      { path: 'home-sections', lazy: adminRoute(() => import('./components/AdminHomeSections.jsx')) },
      { path: 'navigation', lazy: adminRoute(() => import('./components/AdminNavigation.jsx')) },
      { path: 'settings', lazy: adminRoute(() => import('./components/AdminSettings.jsx')) },
      { path: 'support', lazy: routeLazy(() => import('./components/AdminSupports.jsx')) },
      { path: 'audit-logs', lazy: adminRoute(() => import('./components/AdminAuditLogs.jsx')) },
    ],
  },

  {
    path: '/receipt/:orderId',
    lazy: authRoute(() => import('./pages/OfficialReceipt.jsx')),
    errorElement: <RouteErrorBoundary />,
    HydrateFallback: FoodBowlLoader,
  },

  {
    path: '*',
    lazy: routeLazy(() => import('./pages/NotFound.jsx')),
    errorElement: <RouteErrorBoundary />,
    HydrateFallback: FoodBowlLoader,
  },
])

function FoodBowlLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 gap-6">
      <svg width="160" height="140" viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* bowl shadow */}
        <ellipse cx="80" cy="128" rx="45" ry="6" fill="#000" opacity="0.1" />

        {/* bowl body */}
        <path d="M28 72 C28 72 22 125 80 125 C138 125 132 72 132 72" fill="#dc2626" stroke="#991b1b" strokeWidth="2.5" />
        <path d="M35 75 C35 75 30 118 80 118 C130 118 125 75 125 75" fill="#ef4444" />
        {/* bowl rim */}
        <ellipse cx="80" cy="72" rx="54" ry="12" fill="#dc2626" stroke="#991b1b" strokeWidth="2.5" />
        <ellipse cx="80" cy="70" rx="48" ry="8" fill="#f87171" opacity="0.6" />
        {/* bowl base */}
        <ellipse cx="80" cy="125" rx="28" ry="5" fill="#991b1b" />

        {/* falling pellets — straight down into bowl */}
        <g>
          <rect x="74" y="0" width="12" height="8" rx="4" fill="#b45309" stroke="#92400e" strokeWidth="1" className="animate-[drop_0.8s_linear_infinite]" />
          <circle cx="82" cy="0" r="6" fill="#d97706" stroke="#b45309" strokeWidth="1" className="animate-[drop_0.9s_linear_0.2s_infinite]" />
          <rect x="76" y="0" width="10" height="7" rx="3.5" fill="#b45309" stroke="#92400e" strokeWidth="1" className="animate-[drop_0.75s_linear_0.4s_infinite]" />
          <circle cx="79" cy="0" r="5" fill="#ca8a04" stroke="#a16207" strokeWidth="1" className="animate-[drop_0.85s_linear_0.6s_infinite]" />
          <ellipse cx="84" cy="0" rx="7" ry="4.5" fill="#d97706" stroke="#b45309" strokeWidth="1" className="animate-[drop_0.8s_linear_0.3s_infinite]" />
          <circle cx="76" cy="0" r="5.5" fill="#b45309" stroke="#92400e" strokeWidth="1" className="animate-[drop_0.95s_linear_0.5s_infinite]" />
          <rect x="78" y="0" width="9" height="6" rx="3" fill="#ca8a04" stroke="#a16207" strokeWidth="1" className="animate-[drop_0.7s_linear_0.1s_infinite]" />
        </g>
      </svg>

      <p className="text-sm font-medium text-gray-400 dark:text-gray-500 animate-pulse">Filling the bowl...</p>
    </div>
  )
}

function App() {
  return <RouterProvider router={router} />
}

export default App
