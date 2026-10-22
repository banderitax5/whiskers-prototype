import { useEffect, useRef, useState } from 'react'
import { justVerifiedEmail } from '../lib/supabase'
import { subscribeAuthNotice } from '../lib/authNotice'

const AUTO_DISMISS_MS = 6000

// Large, top-center confirmation banner for account events (email verified,
// password changed). Deliberately separate from the bottom-right toast stack.
export default function AuthNotice() {
  const [notice, setNotice] = useState(null)
  const greetedVerification = useRef(false)

  useEffect(() => subscribeAuthNotice(setNotice), [])

  // the marker is read once at module load; greet the shopper once per visit
  useEffect(() => {
    if (!justVerifiedEmail || greetedVerification.current) return
    greetedVerification.current = true
    setNotice({
      id: 'email-verified',
      title: 'Email verified',
      body: 'Your account is confirmed. Welcome to Whiskers!',
    })
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notice])

  if (!notice) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[10100] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-xl items-start gap-4 rounded-2xl border border-green-200 bg-white px-5 py-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 dark:border-green-800 dark:bg-gray-800"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{notice.title}</p>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{notice.body}</p>
        </div>
        <button
          type="button"
          onClick={() => setNotice(null)}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
