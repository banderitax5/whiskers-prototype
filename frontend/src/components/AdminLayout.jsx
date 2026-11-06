import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom"
import { useState, useEffect } from "react"
import supabase from "../lib/supabase"
import RecoveryGate from "./RecoveryGate.jsx"
import StepUpModal from "./StepUpModal.jsx"
import AdminPushToggle from "./AdminPushToggle.jsx"
import { clearStepUp } from "../lib/stepUp"
import { useThemeDetection } from "./adminTheme"
import { useRole } from "../context/RoleContext"
import FloatingNotification from "./Toaster.jsx"
import { ADMIN_NAV, ADMIN_NAV_GROUPS, canSeeNav } from "../lib/permissions"
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
  BsListUl,
  BsGear,
  BsChevronDown,
  BsLayoutSidebar,
  BsBoxArrowRight,
  BsSunFill,
  BsMoonStarsFill,
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
  listUl: <BsListUl />,
  gear: <BsGear />,
}

// the layout wrapper for all admin pages
// has a sidebar with navigation links that slides in on mobile
// on desktop (md and up) the sidebar is always visible and can collapse to an
// icon-only rail via the toggle in the top bar
// the main content area renders whatever admin sub-page is active via Outlet
function AdminLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // groups start expanded; clicking a section heading collapses/expands it
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  // desktop-only rail mode: shrinks the sidebar to icons (mobile always opens
  // full-width via the hamburger)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("admin-sidebar-collapsed") === "1"
    } catch {
      return false
    }
  })
  const role = useRole()
  const { theme, toggleTheme } = useThemeDetection()

  useEffect(() => {
    try {
      localStorage.setItem("admin-sidebar-collapsed", sidebarCollapsed ? "1" : "0")
    } catch {
      // storage can be unavailable (private mode); collapsing still works
    }
  }, [sidebarCollapsed])

  function toggleGroup(group) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  // top-bar title follows the active route (single source: ADMIN_NAV labels)
  const currentNav = ADMIN_NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))

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
  // staff/admin split has one source of truth (see comments there).
  // group them into sections, dropping sections the role can't see at all
  const navGroups = ADMIN_NAV_GROUPS.map((group) => ({
    group,
    links: ADMIN_NAV.filter((link) => link.group === group && canSeeNav(link, role)),
  })).filter((section) => section.links.length > 0)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0b1929]">
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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0b2e59] text-white flex flex-col p-5 overflow-y-auto transition-all duration-300 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'md:w-[72px] md:px-2' : ''}`}
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
        <div className={`mb-8 ${sidebarCollapsed ? "md:mb-4" : ""}`}>
          <div
            className={`w-20 h-20 bg-gradient-to-br from-yellow-300 to-yellow-500 text-[#0b2e59] rounded-full flex items-center justify-center text-3xl font-bold mb-3 shadow-md ${sidebarCollapsed ? "md:w-10 md:h-10 md:text-base md:mb-0 md:mx-auto" : ""}`}
          >
            {getInitial()}
          </div>
          <p className={`font-semibold text-sm text-white ${sidebarCollapsed ? "md:hidden" : ""}`}>
            Welcome, {user?.email?.split("@")[0] || "Admin"}
          </p>
        </div>

        {/* sidebar nav links grouped into collapsible dropdown sections,
            clicking a link also closes the sidebar on mobile */}
        <nav className="flex flex-col gap-2">
          {navGroups.map(({ group, links }) => {
            const collapsed = collapsedGroups.has(group)
            const groupActive = links.some((link) =>
              link.end ? pathname === link.to : pathname.startsWith(link.to)
            )
            const panelId = `admin-nav-group-${group.replace(/\s+/g, "-").toLowerCase()}`

            return (
              <div
                key={group}
                className={`flex flex-col ${sidebarCollapsed ? "md:border-t md:border-white/10 md:pt-2 md:first:border-t-0 md:first:pt-0" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!collapsed}
                  aria-controls={panelId}
                  className={`flex items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-white/5 ${sidebarCollapsed ? "md:hidden" : ""} ${
                    groupActive ? "text-yellow-300/90" : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {group}
                  <BsChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
                  />
                </button>

                {(!collapsed || sidebarCollapsed) && (
                  <div id={panelId} className="mt-1 flex flex-col gap-1">
                    {links.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.end}
                        onClick={() => setSidebarOpen(false)}
                        title={link.label}
                        className={({ isActive }) =>
                          `${linkClass} ${sidebarCollapsed ? "md:justify-center md:px-0" : ""} ${isActive ? activeClass : inactiveClass}`
                        }
                      >
                        {NAV_ICONS[link.iconKey]}
                        <span className={sidebarCollapsed ? "md:hidden" : ""}>{link.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* sign out and back to user view at the bottom of the sidebar */}
        <div className="mt-auto space-y-3">
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? "Sign Out" : undefined}
            className={`flex w-full items-center gap-2 text-left text-sm text-red-400 hover:text-red-300 ${sidebarCollapsed ? "md:justify-center" : ""}`}
          >
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Sign Out</span>
            <BsBoxArrowRight className={`h-4 w-4 ${sidebarCollapsed ? "hidden md:block" : "hidden"}`} />
          </button>
          <button
            onClick={() => navigate("/")}
            title={sidebarCollapsed ? "Back to User View" : undefined}
            className={`flex items-center gap-2 text-xs text-white/70 hover:text-white ${sidebarCollapsed ? "md:justify-center" : ""}`}
          >
            <BsArrowLeft />
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Back to User View</span>
          </button>
        </div>
      </aside>

      {/* main content area where the active admin page renders */}
        {/* relative: gives sr-only (absolute) labels inside the page a
            containing block here — otherwise they escape this overflow-y-auto
            and extend the whole document, producing a second (window) scrollbar */}
        <main className="relative flex-1 p-4 sm:p-6 overflow-y-auto dark:bg-[#0b1929]">

        {/* top bar with hamburger menu (mobile), rail toggle (desktop) and title */}
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

          {/* desktop toggle that collapses the sidebar to an icon rail */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-[#1e3a5f] dark:text-slate-300 dark:hover:bg-[#162d4a] md:flex"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <BsLayoutSidebar className="h-5 w-5" />
          </button>

          <h1 className="min-w-0 truncate text-lg font-semibold text-gray-800 dark:text-slate-100 sm:text-xl">
            {currentNav ? currentNav.label : role === 'staff' ? 'Staff Dashboard' : 'Admin Dashboard'}
          </h1>

          {/* order notifications for this device (hidden when unsupported) */}
          <AdminPushToggle />

          {/* theme toggle: shows the mode it will switch to */}
          <button
            type="button"
            onClick={toggleTheme}
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-[#1e3a5f] dark:text-slate-300 dark:hover:bg-[#162d4a]"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <BsSunFill className="h-4 w-4" /> : <BsMoonStarsFill className="h-4 w-4" />}
          </button>
        </div>

        <Outlet />
      </main>
      <FloatingNotification />
    </div>
  )
}

export default AdminLayout
