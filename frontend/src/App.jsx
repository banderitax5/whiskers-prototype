import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Pets from './pages/Pets.jsx'
import Menu from './pages/Menu.jsx'
import Profile from './pages/Profile.jsx'
import NotFound from './pages/NotFound.jsx'
import Admin from './pages/Admin.jsx'
import supabase from './lib/supabase'
import AdminLayout from './components/AdminLayout.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// this wraps any page that needs the user to be logged in
// it checks if there's a supabase session - if not, kicks them back to home
// shows nothing while loading so you don't get a flash of the wrong page
function RequireAuth({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Navigate to="/" replace />
  return children
}

// this wraps admin-only pages - first checks if the user is logged in,
// then hits the backend to verify they actually have the 'admin' role
// if they're not an admin, sends them back to home
// this way even if someone types /admin in the URL, they can't get in
function RequireAdmin({ children }) {
  const [state, setState] = useState('loading')

  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setState('denied'); return }
      try {
        const res = await fetch(`${API_BASE}/me/role`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) { setState('denied'); return }
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

// all the routes for the app - Layout wraps everything with the navbar and footer
// profile is protected by RequireAuth so only logged-in users can see it
// admin is protected by RequireAdmin so only admins can access it
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'menu', element: <Menu /> },
      { path: 'about', element: <About /> },
      { path: 'pets', element: <Pets /> },
      { path: 'profile', element: <RequireAuth><Profile /></RequireAuth> },
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

      // future admin pages (optional but ready)
      // { path: 'products', element: <Products /> },
      // { path: 'inventory', element: <Inventory /> },
    ],
  },

  { path: '*', element: <NotFound /> },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
