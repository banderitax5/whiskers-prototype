import React, { useState } from 'react'
import supabase from '../lib/supabase'

function LoginModal({ isOpen, onClose, onSwitchToSignup, onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
      if (!data.user) throw new Error('Login failed')
      onLoginSuccess?.()
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
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-lg sm:max-w-2xl lg:max-w-4xl flex flex-col md:flex-row shadow-xl animate-in fade-in duration-300">
        {/* Left side - Image */}
        <div className="md:w-1/2 p-3 hidden md:flex items-center justify-center">
          <img
            src="login/dog.png"
            alt="Happy dog"
            className="w-full h-full object-cover rounded-lg"
          />
        </div>

        {/* Right side - Login form */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 relative">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Logo */}
          <div className="flex justify-center mb-6 sm:mb-8">
            <img src="logo/logo-whiskers.png" alt="Whiskers" className="h-10 sm:h-12" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                EMAIL
              </label>
              <input
                type="email"
                id="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white border-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                PASSWORD
              </label>
              <input
                type="password"
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white border-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] text-white font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in…' : 'Login'}
              {!loading && (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </form>

          {/* Sign up link */}
          <p className="mt-6 text-center text-xs sm:text-sm text-gray-600">
             New customer?{' '}
             <button
               className="text-[#0039a6] hover:text-[#0046cc] font-semibold"
               onClick={() => {
                 onClose();
                 onSwitchToSignup();
               }}
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
