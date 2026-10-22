import { useState, useEffect } from 'react'

const COOKIE_KEY = 'whiskers_cookie_consent'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY)
    if (!consent) setVisible(true)
  }, [])

  function accept() {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    setVisible(false)
  }

  function decline() {
    localStorage.setItem(COOKIE_KEY, 'declined')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-3 sm:p-6">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex-1">
          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            We use cookies to improve your experience. By continuing to browse, you agree to our use of cookies.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={decline}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg transition hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-[#0b2e59] hover:bg-[#15407a] rounded-lg transition"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
