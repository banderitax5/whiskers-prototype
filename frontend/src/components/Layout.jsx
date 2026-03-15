import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Banner from './Banner.jsx'
import Strip from './Strip.jsx'
import Footer from './Footer.jsx'

// the layout wrapper - every page gets the navbar, strip, and footer automatically
// Outlet is where the actual page content (Home, Profile, etc.) gets rendered
// the banner (brand carousel) is hidden on profile/orders/addresses pages
// because it looks weird on those - it's only for the shopping pages
function Layout() {
	const location = useLocation()
	const showBanner = location.pathname !== '/profile' && location.pathname !== '/orders' && location.pathname !== '/addresses'

	return (
		<div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
			<Navbar />
			<Strip />
			{showBanner && <Banner />}
			<main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
				<Outlet />
			</main>
			<Footer />
		</div>
	)
}

export default Layout
