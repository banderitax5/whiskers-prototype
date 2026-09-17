import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import Layout from './components/Layout.jsx'

// USER PAGES (lazy loaded — chunks split per page)
const Home = lazy(() => import('./pages/Home.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const Pets = lazy(() => import('./pages/Pets.jsx'))
const Menu = lazy(() => import('./pages/Menu.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Cart = lazy(() => import('./pages/Cart.jsx'))
const Checkout = lazy(() => import('./pages/Checkout.jsx'))
const UserOrders = lazy(() => import('./pages/UserOrders.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

// ADMIN COMPONENTS (lazy loaded — only fetched when admin visits /admin)
const AdminLayout = lazy(() => import('./components/AdminLayout.jsx'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard.jsx'))
const AdminPayments = lazy(() => import('./components/AdminPayments.jsx'))
const AdminInventoryManagement = lazy(() => import('./components/AdminInventoryManagement.jsx'))
const AdminProductManagement = lazy(() => import('./components/AdminProductManagement.jsx'))
const AdminOrders = lazy(() => import('./components/AdminOrders.jsx'))
const AdminAuditLogs = lazy(() => import('./components/AdminAuditLogs.jsx'))
const AdminCustomers = lazy(() => import('./components/AdminCustomers.jsx'))

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

// checks the user's role via the backend and only renders children if admin
// uses a checked flag that is only set after a successful call so that
// if the first auth event carries a revoked token the next event retries
function RequireAdmin({ children }) {
  const [state, setState] = useState('loading')
  const checkedRef = useRef(false)

  useEffect(() => {
    async function checkAdmin(token) {
      if (!token) return
      try {
        const res = await fetch(`${API_BASE}/me/role`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const { role } = await res.json()
        checkedRef.current = true
        setState(role === 'admin' ? 'allowed' : 'denied')
      } catch {
        // let the next auth event retry
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

    return () => subscription.unsubscribe()
  }, [])

  if (state === 'loading') return null
  if (state === 'denied') return <Navigate to="/" replace />

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
      { index: true, element: <AdminDashboard /> },
      { path: 'products', element: <AdminProductManagement /> },
      { path: 'inventory', element: <AdminInventoryManagement /> },
      { path: 'customers', element: <AdminCustomers /> },
      { path: 'orders', element: <AdminOrders /> },
      { path: 'payments', element: <AdminPayments /> },
      { path: 'audit-logs', element: <AdminAuditLogs /> },
    ],
  },

  { path: '*', element: <NotFound /> },
])

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  )
}

export default App
