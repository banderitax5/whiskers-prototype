import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <body className="bg-white">
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <h1 className="text-7xl sm:text-9xl font-extrabold text-[#0b2e59]">404</h1>
        <div className="mt-4 mb-2 w-16 h-1 rounded-full bg-[#ffd21e]" />
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mt-2">
          Page Not Found
        </h2>
        <p className="text-gray-500 mt-2 max-w-md">
          Sorry, the page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 h-11 px-8 rounded-lg bg-[#0b2e59] text-white font-semibold hover:bg-[#1f4db8] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Home
        </Link>
      </div>
    </body>
  )
}

export default NotFound