import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import supabase from "../lib/supabase"
import {
  BsBarChart,
  BsBoxSeam,
  BsClipboardData,
  BsPeople,
  BsCreditCard,
  BsArrowLeft,
  BsList,
  BsXLg,
} from "react-icons/bs"

// the layout wrapper for all admin pages
// has a sidebar with navigation links that slides in on mobile
// on desktop (md and up) the sidebar is always visible
// the main content area renders whatever admin sub-page is active via Outlet
function AdminLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // grab the current user on mount so we can show their name/initial
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  // signs the admin out and sends them back to the homepage
  async function handleLogout() {
    await supabase.auth.signOut()
    navigate("/")
  }

  // gets the first letter of the user's name or email for the avatar circle
  const getInitial = () => {
    if (!user) return "?"
    const firstName = user.user_metadata?.first_name
    if (firstName) return firstName.charAt(0).toUpperCase()
    if (user.email) return user.email.charAt(0).toUpperCase()
    return "?"
  }

  // shared tailwind classes for the sidebar nav links
  const linkClass =
    "flex items-center gap-3 px-3 py-2 rounded-md transition text-sm"

  const activeClass = "bg-white/10 text-yellow-300"
  const inactiveClass = "text-white/80 hover:bg-white/10 hover:text-white"

  // all the sidebar navigation items in one array so we can loop over them
  const navLinks = [
    { to: "/admin", label: "Data Analytics", icon: <BsBarChart />, end: true },
    { to: "/admin/products", label: "Product Management", icon: <BsBoxSeam /> },
    { to: "/admin/inventory", label: "Inventory Management", icon: <BsClipboardData /> },
    { to: "/admin/customers", label: "Customers", icon: <BsPeople /> },
    { to: "/admin/payments", label: "Payments", icon: <BsCreditCard /> },
  ]

  return (
    <div className="flex h-screen bg-gray-100">

      {/* dark overlay that shows behind the sidebar on mobile when it's open */}
      {/* tapping it closes the sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* sidebar navigation panel */}
      {/* on mobile it slides in from the left, on desktop it's always there */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0b2e59] text-white flex flex-col p-5 transition-transform duration-300 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* x button to close the sidebar, only visible on mobile */}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="mb-4 self-end text-white/70 hover:text-white md:hidden"
          aria-label="Close sidebar"
        >
          <BsXLg className="h-5 w-5" />
        </button>

        {/* admin profile avatar and welcome message */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-300 to-yellow-500 text-[#0b2e59] rounded-full flex items-center justify-center text-3xl font-bold mb-3 shadow-md">
            {getInitial()}
          </div>
          <p className="font-semibold text-sm">
            Welcome, {user?.email?.split("@")[0] || "Admin"}
          </p>
        </div>

        {/* sidebar nav links, clicking one also closes the sidebar on mobile */}
        <nav className="flex flex-col gap-2">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `${linkClass} ${isActive ? activeClass : inactiveClass}`
              }
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* sign out and back to user view at the bottom of the sidebar */}
        <div className="mt-auto space-y-3">
          <button
            onClick={handleLogout}
            className="w-full text-left text-red-400 hover:text-red-300 text-sm"
          >
            Sign Out
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-xs text-white/70 hover:text-white"
          >
            <BsArrowLeft />
            Back to User View
          </button>
        </div>
      </aside>

      {/* main content area where the active admin page renders */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">

        {/* top bar with hamburger menu (mobile), title, search, and profile icon */}
        <div className="flex items-center justify-between mb-6 gap-3">
          {/* hamburger button to open the sidebar on mobile */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label="Open sidebar"
          >
            <BsList className="h-5 w-5" />
          </button>

          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">
            Admin Dashboard
          </h1>

          <div className="flex items-center gap-3">
            {/* search input hidden on very small screens */}
            <input
              type="text"
              placeholder="Search..."
              className="hidden sm:block px-4 py-2 rounded-full border text-sm focus:outline-none focus:ring-1 focus:ring-yellow-600 bg-white"
            />
            <div className="w-8 h-8 bg-yellow-400 text-[#0b2e59] rounded-full flex items-center justify-center text-sm font-bold">
              {getInitial()}
            </div>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
