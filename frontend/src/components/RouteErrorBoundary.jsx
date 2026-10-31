import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

// Rendered by React Router when a route element, loader, or lazy module throws.
// Keeps the app usable instead of leaving a blank screen.
function RouteErrorBoundary() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : null
  const message = status === 404
    ? 'We could not find that page. It may have moved, or the link may be wrong.'
    : 'This page could not be loaded. Please try again, or head back to the shop.'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center dark:bg-gray-900">
      <p className="text-6xl font-extrabold text-[#0b2e59] dark:text-white">{status || 'Oops'}</p>
      <div className="my-4 h-1 w-16 rounded-full bg-[#ffd21e]" />
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 sm:text-2xl">
        {status === 404 ? 'Page not found' : 'Something went wrong'}
      </h1>
      <p className="mt-2 max-w-md text-gray-500 dark:text-gray-400">{message}</p>
      <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
        Try again, or head back to the shop.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-lg bg-[#0b2e59] px-6 font-semibold text-white transition-colors hover:bg-[#1f4db8]"
        >
          Try again
        </button>
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-lg border border-[#0b2e59] px-6 font-semibold text-[#0b2e59] transition-colors hover:bg-[#0b2e59] hover:text-white dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Back to home
        </Link>
      </div>
      {import.meta.env.DEV && error instanceof Error && error.message && (
        <pre className="mt-6 max-h-40 max-w-lg overflow-auto rounded-lg bg-red-50 p-3 text-left text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error.message}
        </pre>
      )}
    </div>
  )
}

export default RouteErrorBoundary
