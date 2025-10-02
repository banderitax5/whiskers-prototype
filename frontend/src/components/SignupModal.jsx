import React from 'react'
import { Link } from 'react-router-dom'

function SignupModal({ isOpen, onClose, onSwitchToLogin }) {
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
          <form className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="firstName" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  FIRST NAME
                </label>
                <input
                  type="text"
                  id="firstName"
                  className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  LAST NAME
                </label>
                <input
                  type="text"
                  id="lastName"
                  className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                PASSWORD
              </label>
              <input
                type="password"
                id="password"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] text-white font-semibold transition-colors mt-4 sm:mt-6"
            >
              Sign Up
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </form>

          {/* Login link */}
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
