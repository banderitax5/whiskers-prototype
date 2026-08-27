import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Layout from './components/Layout.jsx'

// USER PAGES
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Pets from './pages/Pets.jsx'
import Menu from './pages/Menu.jsx'
import Profile from './pages/Profile.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import NotFound from './pages/NotFound.jsx'

// ADMIN COMPONENTS
import AdminLayout from './components/AdminLayout.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import AdminPayments from './components/AdminPayments.jsx'
import AdminInventoryManagement from './components/AdminInventoryManagement.jsx'
import AdminProductManagement from './components/AdminProductManagement.jsx'
import AdminOrders from './components/AdminOrders.jsx'

import supabase from './lib/supabase'
import AdminCustomers from './components/AdminCustomers.jsx'

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
    ],
  },

  { path: '*', element: <NotFound /> },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
