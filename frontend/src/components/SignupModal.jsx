import React, { useState } from 'react'
import supabase from '../lib/supabase'

// the signup modal - shows up when the user clicks "Sign Up" in the navbar
// creates a new account through supabase auth, then immediately sends the
// first name + last name to our backend so they get encrypted and stored
// in the profiles table (supabase only stores email + password in auth.users)
function SignupModal({ isOpen, onClose, onSwitchToLogin, onSignupSuccess }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // the main signup flow - two steps:
  // 1) supabase.auth.signUp creates the user in auth.users and gives us a session
  // 2) we POST to /api/profile/init with the access token so the backend can
  //    encrypt the first name, last name, and email before saving to profiles table
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // step 1: create the user in supabase auth
      // the options.data stuff stores first/last name in raw_user_meta_data
      // which is just extra metadata supabase keeps alongside the auth record
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      })
      if (authError) throw authError
      if (!data.session) throw new Error('Sign up failed')

      // step 2: hit our backend to save the encrypted profile data
      // we pass the access_token so the backend knows who's making the request
      // the backend encrypts everything with AES-256-GCM before storing it
      await fetch('/api/profile/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      })

      // let the parent know signup worked - Navbar's onAuthStateChange
      // listener will automatically pick up the new session too
      onSignupSuccess?.()
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
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-lg sm:max-w-2xl lg:max-w-4xl flex flex-col md:flex-row shadow-xl animate-in fade-in duration-300">
        {/* Left side - Image */}
        <div className="md:w-1/2 p-3 hidden md:flex items-center justify-center">
          <img
            src="login/cat.png"
            alt="Happy cat"
            className="w-full h-full object-cover rounded-lg"
          />
        </div>

        {/* Right side - Signup form */}
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
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* error banner - shows supabase errors like "email already registered" */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
                {error}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="firstName" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  FIRST NAME
                </label>
                <input
                  type="text"
                  id="firstName"
                  placeholder="Enter your first name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  LAST NAME
                </label>
                <input
                  type="text"
                  id="lastName"
                  placeholder="Enter your last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

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
                className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                autoComplete="new-password"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-500 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] text-white font-semibold transition-colors mt-4 sm:mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Sign Up'}
              {!loading && (
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </form>

          {/* switches to the login modal - closes this one first then opens login */}
          <p className="mt-6 text-center text-xs sm:text-sm text-gray-600">
             Already have an account?{' '}
             <button
               className="text-[#0039a6] hover:text-[#0046cc] font-semibold"
               onClick={() => {
                 onClose();
                 onSwitchToLogin();
               }}
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
