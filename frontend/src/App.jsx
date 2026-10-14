import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef, Suspense, lazy, useContext } from 'react'
import Layout from './components/Layout.jsx'
import { RoleContext } from './context/RoleContext.js'

// USER PAGES (lazy loaded — chunks split per page)
const Home = lazy(() => import('./pages/Home.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const Pets = lazy(() => import('./pages/Pets.jsx'))
const Menu = lazy(() => import('./pages/Menu.jsx'))
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Cart = lazy(() => import('./pages/Cart.jsx'))
const Checkout = lazy(() => import('./pages/Checkout.jsx'))
const UserOrders = lazy(() => import('./pages/UserOrders.jsx'))
const Support = lazy(() => import('./pages/Support.jsx'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation.jsx'))
const OfficialReceipt = lazy(() => import('./pages/OfficialReceipt.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

// ADMIN COMPONENTS (lazy loaded — only fetched when admin visits /admin)
const AdminLayout = lazy(() => import('./components/AdminLayout.jsx'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard.jsx'))
const AdminPayments = lazy(() => import('./components/AdminPayments.jsx'))
const AdminProductManagement = lazy(() => import('./components/AdminProductManagement.jsx'))
const AdminOrders = lazy(() => import('./components/AdminOrders.jsx'))
const AdminAuditLogs = lazy(() => import('./components/AdminAuditLogs.jsx'))
const AdminCustomers = lazy(() => import('./components/AdminCustomers.jsx'))
const AdminSupports = lazy(() => import('./components/AdminSupports.jsx'))
const AdminPromos = lazy(() => import('./components/AdminPromos.jsx'))
const AdminMedia = lazy(() => import('./components/AdminMedia.jsx'))
const AdminBanners = lazy(() => import('./components/AdminBanners.jsx'))
const AdminHomeSections = lazy(() => import('./components/AdminHomeSections.jsx'))
const AdminNavigation = lazy(() => import('./components/AdminNavigation.jsx'))

import supabase from './lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// redirects to home if the user is not logged in
function RequireAuth({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s))

    return () => subscription.unsubscribe()
  }, [])

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
        const { role } = await res.json()
        if (cancelled) return
        checkedRef.current = true
        setRole(role)
        setState(role === 'admin' || role === 'staff' ? 'allowed' : 'denied')
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

// ROUTES
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'menu', element: <Menu /> },
      { path: 'products/:prod_id', element: <ProductDetail /> },
      { path: 'cart', element: <Cart /> },
      { path: 'checkout', element: <Checkout /> },
      {
        path: 'orders',
        element: (
          <RequireAuth>
            <UserOrders />
          </RequireAuth>
        ),
      },
      {
        path: 'orders/:orderId',
        element: (
          <RequireAuth>
            <OrderConfirmation />
          </RequireAuth>
        ),
      },
      { path: 'about', element: <About /> },
      {
        path: 'pets',
        element: (
          <RequireAuth>
            <Pets />
          </RequireAuth>
        ),
      },
      {
        path: 'profile',
        element: (
          <RequireAuth>
            <Profile />
          </RequireAuth>
        ),
      },
      {
        path: 'support',
        element: (
          <RequireAuth>
            <Support />
          </RequireAuth>
        ),
      },
      { path: 'reset', element: <ResetPassword /> },
    ],
  },

  // ADMIN ROUTES (separate layout - no navbar)
  {
    path: '/admin',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      // the analytics dashboard and account tools stay admin-only;
      // staff land on /admin/orders instead
      { index: true, element: <RequireRole role="admin" fallback="/admin/orders"><AdminDashboard /></RequireRole> },
      { path: 'products', element: <AdminProductManagement /> },
      { path: 'customers', element: <RequireRole role="admin" fallback="/admin/orders"><AdminCustomers /></RequireRole> },
      { path: 'orders', element: <AdminOrders /> },
      { path: 'payments', element: <AdminPayments /> },
      { path: 'promos', element: <RequireRole role="admin" fallback="/admin/orders"><AdminPromos /></RequireRole> },
      { path: 'media', element: <RequireRole role="admin" fallback="/admin/orders"><AdminMedia /></RequireRole> },
      { path: 'banners', element: <RequireRole role="admin" fallback="/admin/orders"><AdminBanners /></RequireRole> },
      { path: 'home-sections', element: <RequireRole role="admin" fallback="/admin/orders"><AdminHomeSections /></RequireRole> },
      { path: 'navigation', element: <RequireRole role="admin" fallback="/admin/orders"><AdminNavigation /></RequireRole> },
      { path: 'support', element: <AdminSupports /> },
      { path: 'audit-logs', element: <RequireRole role="admin" fallback="/admin/orders"><AdminAuditLogs /></RequireRole> },
    ],
  },

  // PRINTABLE RECEIPT (standalone — no navbar/footer, like NotFound)
  {
    path: '/receipt/:orderId',
    element: (
      <RequireAuth>
        <OfficialReceipt />
      </RequireAuth>
    ),
  },

  { path: '*', element: <NotFound /> },
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

      <style>{`
        @keyframes drop {
          0% { transform: translateY(-20px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(85px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<FoodBowlLoader />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}

export default App
