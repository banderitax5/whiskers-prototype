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
} from "react-icons/bs"

function AdminLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate("/")
  }

  // ✅ GET USER INITIAL
  const getInitial = () => {
    if (!user) return "?"

    const firstName = user.user_metadata?.first_name
    if (firstName) return firstName.charAt(0).toUpperCase()

    if (user.email) return user.email.charAt(0).toUpperCase()

    return "?"
  }

  const linkClass =
    "flex items-center gap-3 px-3 py-2 rounded-md transition text-sm"

  const activeClass = "bg-white/10 text-yellow-300"
  const inactiveClass = "text-white/80 hover:bg-white/10 hover:text-white"

  return (
    <div className="flex h-screen bg-gray-100">

      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0b2e59] text-white flex flex-col p-5">

        {/* PROFILE */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-300 to-yellow-500 text-[#0b2e59] rounded-full flex items-center justify-center text-3xl font-bold mb-3 shadow-md">
            {getInitial()}
          </div>

          <p className="font-semibold text-sm">
            Welcome, {user?.email?.split("@")[0] || "Admin"}
          </p>
        </div>

        {/* NAVIGATION */}
        <nav className="flex flex-col gap-2">

          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : inactiveClass}`
            }
          >
            <BsBarChart />
            Data Analytics
          </NavLink>

          <NavLink
            to="/admin/products"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : inactiveClass}`
            }
          >
            <BsBoxSeam />
            Product Management
          </NavLink>

          <NavLink
            to="/admin/inventory"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : inactiveClass}`
            }
          >
            <BsClipboardData />
            Inventory Management
          </NavLink>

          <NavLink
            to="/admin/customers"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : inactiveClass}`
            }
          >
            <BsPeople />
            Customers
          </NavLink>

          <NavLink
            to="/admin/payments"
            className={({ isActive }) =>
              `${linkClass} ${isActive ? activeClass : inactiveClass}`
            }
          >
            <BsCreditCard />
            Payments
          </NavLink>
        </nav>

        {/* FOOTER */}
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

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 overflow-y-auto">

        {/* TOP BAR */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-800">
            Admin Dashboard
          </h1>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search data, users, or reports..."
              className="px-4 py-2 rounded-full border text-sm focus:outline-none focus:ring-1 focus:ring-yellow-600 bg-white"
            />

            {/* SMALL PROFILE ICON */}
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