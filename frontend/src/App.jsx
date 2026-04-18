import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
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

import supabase from './lib/supabase'
import AdminCustomers from './components/AdminCustomers.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// RequireAuth
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

// RequireAdmin
function RequireAdmin({ children }) {
  const [state, setState] = useState('loading')

  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setState('denied')
        return
      }

      try {
        const res = await fetch(`${API_BASE}/me/role`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        if (!res.ok) {
          setState('denied')
          return
        }

        const { role } = await res.json()
        setState(role === 'admin' ? 'allowed' : 'denied')
      } catch {
        setState('denied')
      }
    }

    checkAdmin()
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
      { path: 'pets', element: <Pets /> },
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
      { path: 'payments', element: <AdminPayments /> },
    ],
  },

  { path: '*', element: <NotFound /> },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
