import { Outlet } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Banner from './Banner.jsx'
import Strip from './Strip.jsx'

function Layout() {
	return (
		<div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
			<Navbar />
			<Strip />
			<Banner />
			<main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
				<Outlet />
			</main>
			<footer className="mt-auto border-t bg-white/80">
				<div className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-3 text-sm text-gray-600 max-w-6xl">
					© {new Date().getFullYear()} Whiskers
				</div>
			</footer>
		</div>
	)
}

export default Layout


