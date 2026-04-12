import { Outlet } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import NavLinks from './NavLinks.jsx'
import Strip from './Strip.jsx'
import Footer from './Footer.jsx'

// the layout wrapper - strip, navbar, nav links row, then main content and footer
// Outlet is where the actual page content (Home, Profile, etc.) gets rendered
function Layout() {

	return (
		<div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
			<Strip />
			<Navbar />
			<NavLinks />
			<main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
				<Outlet />
			</main>
			<Footer />
		</div>
	)
}

export default Layout
