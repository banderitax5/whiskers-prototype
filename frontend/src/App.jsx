import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Pets from './pages/Pets.jsx'
import Profile from './pages/Profile.jsx'
import NotFound from './pages/NotFound.jsx'
import supabase from './lib/supabase'

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

const router = createBrowserRouter([
  {
    path: '/',                    
    element: <Layout />,          
    children: [
      { index: true, element: <Home /> },           
      { path: 'about', element: <About /> },        
      { path: 'pets', element: <Pets /> },          
      { path: 'profile', element: <RequireAuth><Profile /></RequireAuth> },            
    ],
  },
  {
     path: '*', element: <NotFound /> 
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
