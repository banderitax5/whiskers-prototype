import React, { useState, useEffect } from 'react'
import { BsEye, BsEyeSlash } from 'react-icons/bs'
import { onStepUpRequest, rejectStepUp, verifyStepUp } from '../lib/stepUp'

// Modal that asks the admin to re-enter their password before a sensitive
// action (e.g. changing a user's role) proceeds. Rendered once in AdminLayout.
function StepUpModal() {
  const [open, setOpen] = useState(false)
  const [accessToken, setAccessToken] = useState(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = onStepUpRequest(({ accessToken: token }) => {
      setAccessToken(token)
      setPassword('')
      setError('')
      setShowPassword(false)
      setOpen(true)
    })
    return () => {
      unsubscribe()
      rejectStepUp(new Error('Verification cancelled'))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' && !loading) handleCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function handleCancel() {
    setOpen(false)
    rejectStepUp(new Error('Verification cancelled'))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) {
      setError('Password is required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await verifyStepUp(accessToken, password)
      setOpen(false)
    } catch (err) {
      setError(err.message || 'Verification failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4 z-[80]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 relative animate-in fade-in duration-300" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-5">
          <h2 id="stepup-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Confirm it&apos;s you
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Changing user roles is a sensitive action. Re-enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 dark:bg-red-900 dark:text-red-200 px-3 py-2 rounded-lg" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="stepup-password" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              PASSWORD
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="stepup-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                required
                autoFocus
                autoComplete="current-password"
                className="w-full px-3 sm:px-4 py-3 pr-10 rounded-lg border bg-white dark:bg-gray-700 border-gray-500 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <BsEyeSlash className="h-4 w-4" /> : <BsEye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StepUpModal
