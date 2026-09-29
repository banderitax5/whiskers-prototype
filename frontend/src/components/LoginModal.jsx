import React, { useState, useEffect } from 'react'
import { BsEye, BsEyeSlash } from 'react-icons/bs'
import supabase from '../lib/supabase'
import { trackEvent } from '../lib/appEvents.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function LoginModal({ isOpen, onClose, onSwitchToSignup, onLoginSuccess }) {
  const [view, setView] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setView('login')
      setError('')
      setForgotError('')
      setForgotSent(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  function validate() {
    const errs = {}
    if (!email.trim()) errs.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Password is required.'
    return errs
  }

  async function handleForgot(e) {
    e.preventDefault()
    setForgotError('')
    if (!email.trim()) {
      setForgotError('Enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setForgotError('Enter a valid email address.')
      return
    }
    setForgotLoading(true)
    const { error: sendErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    })
    setForgotLoading(false)
    if (sendErr) {
      setForgotError(sendErr.message || 'Could not send the reset email. Try again in a moment.')
      return
    }
    setForgotSent(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')

      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (setErr) throw setErr

      onLoginSuccess?.()
      trackEvent('login')
      onClose()
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4 z-[70]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden w-full max-w-lg sm:max-w-2xl lg:max-w-4xl flex flex-col md:flex-row shadow-xl animate-in fade-in duration-300">
        <div className="md:w-1/2 p-3 hidden md:flex items-center justify-center">
          <img src="/login/dog.png" alt="Happy dog" className="w-full h-full object-cover rounded-lg" />
        </div>

        <div className="w-full md:w-1/2 p-6 sm:p-8 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex justify-center mb-6 sm:mb-8">
            <img src="/logo/logo-whiskers.png" alt="Whiskers" className="h-10 sm:h-12" />
          </div>

          {view === 'forgot' ? (
            forgotSent ? (
              <div className="space-y-4">
                <p className="text-sm text-green-700 bg-green-50 dark:bg-green-900 dark:text-green-200 px-3 py-2 rounded-lg" role="status">
                  If an account exists for that email, a reset link is on its way. Check your inbox and spam folder. The link expires soon.
                </p>
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="w-full px-4 py-3 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200"
                >
                  Back to login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4 sm:space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reset your password</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Enter the email you signed up with and we will send you a link to set a new password.
                  </p>
                </div>
                {forgotError && (
                  <p className="text-sm text-red-700 bg-red-50 dark:bg-red-900 dark:text-red-200 px-3 py-2 rounded-lg" role="alert">
                    {forgotError}
                  </p>
                )}
                <div>
                  <label htmlFor="forgot-email" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    EMAIL
                  </label>
                  <input
                    type="email"
                    id="forgot-email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setForgotError('') }}
                    required
                    autoComplete="email"
                    className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white dark:bg-gray-700 border-gray-500 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </button>
                <p className="text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="text-[#0039a6] hover:text-[#0046cc] font-semibold transition-colors"
                  >
                    Back to login
                  </button>
                </p>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {error && (
              <p className="text-sm text-red-700 bg-red-50 dark:bg-red-900 dark:text-red-200 px-3 py-2 rounded-lg" role="alert">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="login-email" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                EMAIL
              </label>
              <input
                type="email"
                id="login-email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })) }}
                required
                autoComplete="email"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white dark:bg-gray-700 border-gray-500 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
              {fieldErrors.email && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                PASSWORD
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 sm:px-4 py-2 pr-10 rounded-lg border bg-white dark:bg-gray-700 border-gray-500 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <BsEyeSlash className="h-4 w-4" /> : <BsEye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.password}</p>}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setView('forgot'); setError(''); setForgotError('') }}
                className="text-xs sm:text-sm text-[#0039a6] hover:text-[#0046cc] font-semibold transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in…' : 'Login'}
              {!loading && (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </form>
          )}

          <p className="mt-6 text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400">
             New customer?{' '}
             <button
               className="text-[#0039a6] hover:text-[#0046cc] font-semibold transition-colors"
               onClick={() => { onClose(); onSwitchToSignup() }}
             >
               Create your account
             </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginModal
