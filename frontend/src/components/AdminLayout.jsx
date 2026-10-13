import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import supabase from "../lib/supabase"
import RecoveryGate from "./RecoveryGate.jsx"
import StepUpModal from "./StepUpModal.jsx"
import { clearStepUp } from "../lib/stepUp"
import { useThemeDetection } from "./adminTheme"
import { useRole } from "../context/RoleContext"
import FloatingNotification from "./Toaster.jsx"
import { ADMIN_NAV, canSeeNav } from "../lib/permissions"
import {
  BsBarChart,
  BsBoxSeam,
  BsPeople,
  BsCreditCard,
  BsReceipt,
  BsArrowLeft,
  BsList,
  BsXLg,
  BsClockHistory,
  BsChatDots,
  BsGift,
  BsImages,
  BsCardImage,
  BsGrid3X3Gap,
} from "react-icons/bs"

// icon keys map to the react-icons components the sidebar uses
const NAV_ICONS = {
  barChart: <BsBarChart />,
  boxSeam: <BsBoxSeam />,
  people: <BsPeople />,
  creditCard: <BsCreditCard />,
  receipt: <BsReceipt />,
  gift: <BsGift />,
  clockHistory: <BsClockHistory />,
  chatDots: <BsChatDots />,
  images: <BsImages />,
  cardImage: <BsCardImage />,
  grid: <BsGrid3X3Gap />,
}

// the layout wrapper for all admin pages
// has a sidebar with navigation links that slides in on mobile
// on desktop (md and up) the sidebar is always visible
// the main content area renders whatever admin sub-page is active via Outlet
function AdminLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const role = useRole()

  useThemeDetection()

  // grab the current user on mount so we can show their name/initial
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  // signs the admin out and sends them back to the homepage
  async function handleLogout() {
    clearStepUp()
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

  // all the sidebar navigation items live in lib/permissions.js so the
  // staff/admin split has one source of truth (see comments there)
  const navLinks = ADMIN_NAV.filter((link) => canSeeNav(link, role))

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0b1929]">
      <RecoveryGate />
      <StepUpModal />

      {/* dark overlay that shows behind the sidebar on mobile when it's open */}
      {/* tapping it closes the sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 md:hidden"
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
          <p className="font-semibold text-sm text-white">
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
              {NAV_ICONS[link.iconKey]}
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
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto dark:bg-[#0b1929]">

        {/* top bar with hamburger menu (mobile) and title */}
        <div className="flex items-center gap-3 mb-6">
          {/* hamburger button to open the sidebar on mobile */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] md:hidden"
            aria-label="Open sidebar"
          >
            <BsList className="h-5 w-5" />
          </button>

          <h1 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-slate-100">
            {role === 'staff' ? 'Staff Dashboard' : 'Admin Dashboard'}
          </h1>
        </div>

        <Outlet />
      </main>
      <FloatingNotification />
    </div>
  )
}

export default AdminLayout
