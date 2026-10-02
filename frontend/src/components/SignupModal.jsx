import React, { useState } from 'react'
import { BsEye, BsEyeSlash } from 'react-icons/bs'
import supabase from '../lib/supabase'
import { trackEvent } from '../lib/appEvents.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// letters (incl. accented/Latin-extended), spaces, hyphens, apostrophes
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ' -]+$/

function isValidName(value) {
  const name = value.trim()
  return name.length >= 2 && name.length <= 50 && NAME_RE.test(name)
}

function SignupModal({ isOpen, onClose, onSwitchToLogin, onSignupSuccess }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  function validateField(field, value) {
    switch (field) {
      case 'firstName':
      case 'lastName': {
        const label = field === 'firstName' ? 'First' : 'Last'
        if (!value.trim()) return `${label} name is required.`
        return isValidName(value) ? '' : 'Use 2-50 letters (spaces, hyphens and apostrophes allowed).'
      }
      case 'email':
        if (!value.trim()) return 'Email is required.'
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : 'Enter a valid email address.'
      case 'password':
        if (!value) return 'Password is required.'
        return value.length >= 8 ? '' : 'Password must be at least 8 characters.'
      case 'confirmPassword':
        if (!value) return 'Please confirm your password.'
        return value === password ? '' : 'Passwords do not match.'
      default:
        return ''
    }
  }

  function validate() {
    const errs = {}
    const fields = { firstName, lastName, email, password, confirmPassword }
    for (const [field, value] of Object.entries(fields)) {
      const msg = validateField(field, value)
      if (msg) errs[field] = msg
    }
    return errs
  }

  // updates a field; if it already shows an error, re-check it right away
  // so the message clears (or updates) while typing, without waiting for Enter
  function handleChange(field, value, setter) {
    setter(value)
    setFieldErrors((p) => (p[field] ? { ...p, [field]: validateField(field, value) } : p))
  }

  // validate when leaving a field so problems appear before pressing Enter
  function handleBlur(field, value) {
    setFieldErrors((p) => ({ ...p, [field]: validateField(field, value) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sign up failed')

      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (setErr) throw setErr

      onSignupSuccess?.()
      trackEvent('signup')
      onClose()
    } catch (err) {
      setError(err.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4 z-[70]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md sm:max-w-lg shadow-xl animate-in fade-in duration-300 max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <div className="w-full p-5 sm:p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex justify-center mb-1">
            <img src="/logo/logo-whiskers.png" alt="Whiskers" className="h-11 sm:h-12" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
            <div className="h-8">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900 dark:text-red-200 px-3 py-1.5 rounded-lg line-clamp-1" role="alert" title={error}>
                  {error}
                </p>
              )}
            </div>
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-firstName" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  FIRST NAME
                </label>
                <input
                  type="text"
                  id="signup-firstName"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => handleChange('firstName', e.target.value, setFirstName)}
                  onBlur={(e) => handleBlur('firstName', e.target.value)}
                  required
                  autoComplete="given-name"
                  maxLength={50}
                  className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <div className="h-6">
                  {fieldErrors.firstName && <p className="text-xs text-red-500 dark:text-red-400 mt-1 line-clamp-1">{fieldErrors.firstName}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="signup-lastName" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  LAST NAME
                </label>
                <input
                  type="text"
                  id="signup-lastName"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => handleChange('lastName', e.target.value, setLastName)}
                  onBlur={(e) => handleBlur('lastName', e.target.value)}
                  required
                  autoComplete="family-name"
                  maxLength={50}
                  className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <div className="h-6">
                  {fieldErrors.lastName && <p className="text-xs text-red-500 dark:text-red-400 mt-1 line-clamp-1">{fieldErrors.lastName}</p>}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                EMAIL
              </label>
              <input
                type="email"
                id="signup-email"
                placeholder="Enter your email"
              value={email}
              onChange={(e) => handleChange('email', e.target.value, setEmail)}
              onBlur={(e) => handleBlur('email', e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
              <div className="h-6">
                {fieldErrors.email && <p className="text-xs text-red-500 dark:text-red-400 mt-1 line-clamp-1">{fieldErrors.email}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                PASSWORD
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    const value = e.target.value
                    handleChange('password', value, setPassword)
                    // keep the "passwords do not match" message in sync while editing
                    setFieldErrors((p) => (p.confirmPassword
                      ? { ...p, confirmPassword: !confirmPassword ? 'Please confirm your password.' : (confirmPassword === value ? '' : 'Passwords do not match.') }
                      : p))
                  }}
                  onBlur={(e) => handleBlur('password', e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-3 sm:px-4 py-2 pr-10 rounded-lg border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <BsEyeSlash className="h-4 w-4" /> : <BsEye className="h-4 w-4" />}
                </button>
              </div>
              <div className="h-6">
                {fieldErrors.password && <p className="text-xs text-red-500 dark:text-red-400 mt-1 line-clamp-1">{fieldErrors.password}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="signup-confirmPassword" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-confirmPassword"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value, setConfirmPassword)}
                  onBlur={(e) => handleBlur('confirmPassword', e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-3 sm:px-4 py-2 pr-10 rounded-lg border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <BsEyeSlash className="h-4 w-4" /> : <BsEye className="h-4 w-4" />}
                </button>
              </div>
              <div className="h-6">
                {fieldErrors.confirmPassword && <p className="text-xs text-red-500 dark:text-red-400 mt-1 line-clamp-1">{fieldErrors.confirmPassword}</p>}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200 mt-1 sm:mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Sign Up'}
              {!loading && (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400">
             Already have an account?{' '}
             <button
               className="text-[#0039a6] hover:text-[#0046cc] font-semibold transition-colors"
               onClick={() => { onClose(); onSwitchToLogin() }}
             >
               Log in
             </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default SignupModal
