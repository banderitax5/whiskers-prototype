import { Outlet } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Strip from './Strip.jsx'
import Banner from './Banner.jsx'

function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <Navbar />
      <Strip />
      <Banner />
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-6">
        <Outlet />
      </main>
      <footer className="mt-auto border-t bg-white/80">
        <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-gray-600">
          © {new Date().getFullYear()} Whiskers
        </div>
      </footer>
    </div>
  )
}

export default Layout


