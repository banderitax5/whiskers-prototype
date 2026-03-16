import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { BsCartFill, BsPersonCircle } from 'react-icons/bs'
import LoginModal from './LoginModal'
import SignupModal from './SignupModal'
import supabase from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// the main navbar - handles navigation, search bar, auth modals, and user dropdown
// it listens to supabase auth state changes so the UI updates automatically
// when someone logs in or out (no manual state juggling needed)
// also fetches the user's role so we can show/hide the admin link
function Navbar() {
	const navigate = useNavigate()
	const [query, setQuery] = useState('')
	const [isLoginOpen, setIsLoginOpen] = useState(false)
	const [isSignupOpen, setIsSignupOpen] = useState(false)
	const [isMobileOpen, setIsMobileOpen] = useState(false)
	const [isDropdownOpen, setIsDropdownOpen] = useState(false)
	const dropdownRef = useRef(null)
	const [user, setUser] = useState(null)
	// tracks whether the current user is an admin - controls visibility of admin links
	const [isAdmin, setIsAdmin] = useState(false)

	// fetches the user's role from the backend whenever we get a new session
	// if they're an admin, we flip isAdmin to true so the admin link shows up
	async function fetchRole(session) {
		if (!session) { setIsAdmin(false); return }
		try {
			const res = await fetch(`${API_BASE}/me/role`, {
				headers: { Authorization: `Bearer ${session.access_token}` },
			})
			if (!res.ok) { setIsAdmin(false); return }
			const { role } = await res.json()
			setIsAdmin(role === 'admin')
		} catch {
			setIsAdmin(false)
		}
	}

	// on mount, grab the current session from supabase to see if someone's already logged in
	// then subscribe to onAuthStateChange - this fires whenever the user logs in, logs out,
	// or the token refreshes, so we always have the latest user state
	// also fetches the role each time the session changes
	useEffect(() => {
		supabase.auth.getSession().then(({ data: { session } }) => {
			setUser(session?.user ?? null)
			fetchRole(session)
		})
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			setUser(session?.user ?? null)
			fetchRole(session)
		})
		return () => subscription.unsubscribe()
	}, [])

	// closes the profile dropdown when you click anywhere outside of it
	// only runs the listener when the dropdown is actually open (saves performance)
	useEffect(() => {
		if (!isDropdownOpen) return
		function handleClickOutside(e) {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setIsDropdownOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [isDropdownOpen])

	// these just close the modals after a successful login/signup
	// the actual session update happens through onAuthStateChange above
	function onLoginSuccess() {
		setIsLoginOpen(false)
	}

	function onSignupSuccess() {
		setIsSignupOpen(false)
	}

	// signs the user out via supabase, clears local state, and sends them home
	// supabase.auth.signOut() kills the session on supabase's end too
	async function handleLogout() {
		await supabase.auth.signOut()
		setUser(null)
		setIsAdmin(false)
		setIsDropdownOpen(false)
		setIsMobileOpen(false)
		navigate('/')
	}

	// placeholder for search - will hook up to a search route later
  function onSearchSubmit(e) {
		e.preventDefault()
  }

  return (
		<header className="bg-[#0b2e59]">
			<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 sm:gap-3 relative z-[60] min-w-0">
				<Link to="/" className="flex items-center gap-2 shrink-0">
					<img src="logo/logo-whiskers.png" alt="Whiskers" className="h-12 w-auto hidden sm:block" />
					<span className="text-white font-bold sm:hidden">Whiskers</span>
				</Link>

				{/* desktop search bar - hidden on mobile, shows in the mobile menu instead */}
				<form onSubmit={onSearchSubmit} role="search" className="hidden md:block flex-1 min-w-0">
					<div className="relative w-full min-w-0 max-w-full md:max-w-md lg:max-w-xl">
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search over 500 Pet products..."
							className="w-full min-w-0 rounded-full bg-white text-gray-900 placeholder-gray-500 h-9 sm:h-10 pl-4 sm:pl-5 pr-11 sm:pr-12 text-sm sm:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
						/>
						<button
							type="submit"
							aria-label="Search"
							className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white text-gray-600 hover:bg-gray-100 grid place-items-center border shrink-0"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
								<circle cx="11" cy="11" r="7"></circle>
								<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
							</svg>
						</button>
					</div>
				</form>

				{/* desktop right side - nav links, auth buttons or profile dropdown, and cart */}
				<div className="ml-auto hidden md:flex items-center gap-3 shrink-0">
					<nav className="flex items-center gap-2">
						<NavLink
							to="/brands"
							className="h-9 px-4 flex items-center justify-center rounded-lg bg-[#1f4db8] text-white text-sm font-semibold hover:bg-[#2b63e3] transition-colors"
						>
							Brands
						</NavLink>
						<NavLink
							to="/deals"
							className="h-9 px-4 flex items-center justify-center rounded-lg bg-[#1f4db8] text-white text-sm font-semibold hover:bg-[#2b63e3] transition-colors"
						>
							Deals
						</NavLink>
						{/* only shows up if the logged-in user has the admin role */}
						{isAdmin && (
							<NavLink
								to="/admin"
								className="h-9 px-4 flex items-center justify-center rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
							>
								Admin
							</NavLink>
						)}
					</nav>

					{/* auth slot - min-width keeps the layout stable whether logged in or out
					    so the search bar doesn't jump around when the buttons change */}
					<div className="flex items-center justify-end min-w-[200px] shrink-0">
						{user ? (
							// logged in - show the profile icon with a dropdown
							<div className="relative" ref={dropdownRef}>
								<button
									onClick={() => setIsDropdownOpen((v) => !v)}
									className="flex items-center justify-center w-9 h-9 rounded-full text-white hover:bg-white/10 transition-colors"
									aria-label="Account menu"
									aria-expanded={isDropdownOpen}
								>
									<BsPersonCircle className="w-7 h-7" />
								</button>
								{isDropdownOpen && (
									<div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-[100]">
										<Link
											to="/profile"
											className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
											onClick={() => setIsDropdownOpen(false)}
										>
											Profile
										</Link>
										<Link
											to="/orders"
											className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
											onClick={() => setIsDropdownOpen(false)}
										>
											Orders
										</Link>
										<Link
											to="/addresses"
											className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
											onClick={() => setIsDropdownOpen(false)}
										>
											Addresses
										</Link>
										{/* admin link in dropdown too - only visible for admins */}
										{isAdmin && (
											<Link
												to="/admin"
												className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
												onClick={() => setIsDropdownOpen(false)}
											>
												Admin Panel
											</Link>
										)}
										<button
											type="button"
											onClick={handleLogout}
											className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
										>
											Logout
										</button>
									</div>
								)}
							</div>
						) : (
							// not logged in - show login and signup buttons
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setIsLoginOpen(true)}
									className="h-9 px-4 flex items-center justify-center rounded-lg border border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition-colors whitespace-nowrap"
								>
									Log In
								</button>
								<button
									type="button"
									onClick={() => setIsSignupOpen(true)}
									className="h-9 px-4 flex items-center justify-center rounded-lg bg-[#ffd21e] text-gray-900 text-sm font-semibold hover:brightness-95 transition-colors whitespace-nowrap"
								>
									Sign Up
								</button>
							</div>
						)}
					</div>

					<NavLink
						to="/cart"
						className="flex items-center justify-center w-9 h-9 rounded-full text-white hover:bg-white/10 transition-colors shrink-0"
						aria-label="Cart"
					>
						<BsCartFill className="w-5 h-5" />
					</NavLink>
				</div>

				{/* mobile - just the cart icon and hamburger button, everything else goes in the slide-down menu */}
				<div className="ml-auto flex md:hidden items-center gap-2 shrink-0">
					<NavLink
						to="/cart"
						className="flex items-center justify-center w-10 h-10 rounded-full text-white hover:bg-white/10 transition-colors shrink-0"
						aria-label="Cart"
					>
						<BsCartFill className="w-5 h-5" />
					</NavLink>
					<button
						type="button"
						className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-white/30 text-white hover:bg-white/10 transition-colors"
						aria-label="Open menu"
						onClick={() => setIsMobileOpen((v) => !v)}
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
							<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
						</svg>
					</button>
				</div>
			</div>

			{/* mobile slide-down menu - has its own search bar, nav links, and auth buttons */}
			{isMobileOpen && (
				<div className="md:hidden border-t border-white/10 bg-[#0b2e59] relative z-[60]">
					<div className="mx-auto max-w-6xl px-4 py-3 space-y-3 min-w-0">
						<form onSubmit={onSearchSubmit} role="search" className="min-w-0 w-full">
							<div className="relative w-full min-w-0">
								<input
									type="search"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Search over 500 Pet products..."
									className="w-full min-w-0 rounded-full bg-white text-gray-900 placeholder-gray-500 h-10 pl-5 pr-12 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
								/>
								<button
									type="submit"
									aria-label="Search"
									className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white text-gray-600 hover:bg-gray-100 grid place-items-center border shrink-0"
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
										<circle cx="11" cy="11" r="7"></circle>
										<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
									</svg>
								</button>
							</div>
						</form>
						<div className="grid grid-cols-2 gap-2">
							<NavLink to="/brands" className="h-10 px-4 grid place-items-center rounded-md bg-[#1f4db8] text-white hover:bg-[#2b63e3]">Brands</NavLink>
							<NavLink to="/deals" className="h-10 px-4 grid place-items-center rounded-md bg-[#1f4db8] text-white hover:bg-[#2b63e3]">Deals</NavLink>
						</div>
						<div className="flex items-center gap-3">
							{user ? (
								<>
									<Link to="/profile" className="text-white/90 hover:text-white font-semibold" onClick={() => setIsMobileOpen(false)}>Profile</Link>
									{/* admin link in mobile menu - only for admins */}
									{isAdmin && (
										<Link to="/admin" className="text-red-300 hover:text-red-200 font-semibold" onClick={() => setIsMobileOpen(false)}>Admin</Link>
									)}
									<button onClick={handleLogout} className="text-red-300 hover:text-red-200 font-semibold">Logout</button>
								</>
							) : (
								<>
									<button onClick={() => { setIsLoginOpen(true) }} className="text-white/90 hover:text-white font-semibold">Log In</button>
									<button onClick={() => { setIsSignupOpen(true) }} className="h-10 px-4 grid place-items-center rounded-full bg-[#ffd21e] text-black font-semibold hover:brightness-95">Sign Up</button>
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* login and signup modals - controlled by state, rendered here so they
			    sit on top of everything else in the DOM */}
			<LoginModal 
				isOpen={isLoginOpen}
				onClose={() => setIsLoginOpen(false)}
				onSwitchToSignup={() => setIsSignupOpen(true)}
				onLoginSuccess={onLoginSuccess}
			/>
			<SignupModal
				isOpen={isSignupOpen}
				onClose={() => setIsSignupOpen(false)}
				onSwitchToLogin={() => setIsLoginOpen(true)}
				onSignupSuccess={onSignupSuccess}
			/>
		</header>
  )
}

export default Navbar
