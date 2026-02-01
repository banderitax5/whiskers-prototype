import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Pets from './pages/Pets.jsx'
import Profile from './pages/Profile.jsx'
import NotFound from './pages/NotFound.jsx'

function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/" replace />
  }
  return children
}

/**
 * Router configuration for the PetConnect application
 * Uses React Router's createBrowserRouter for client-side routing
 */
const router = createBrowserRouter([
  {
    path: '/',                    // Root path
    element: <Layout />,          // Layout component wraps all pages with navbar, etc.
    children: [
      { index: true, element: <Home /> },           // Default route - shows Home component
      { path: 'about', element: <About /> },        // /about - shows About component
      { path: 'pets', element: <Pets /> },          // /pets - shows Pets component
      { path: 'profile', element: <RequireAuth><Profile /></RequireAuth> },    // /profile - user profile (auth required)
      { path: '*', element: <NotFound /> },         // Catch-all route for 404 errors
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
