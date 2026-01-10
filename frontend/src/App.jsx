import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Pets from './pages/Pets.jsx'
import NotFound from './pages/NotFound.jsx'

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
      { path: '*', element: <NotFound /> },         // Catch-all route for 404 errors
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
