import { Link } from 'react-router-dom'
import { LostAuthenticatorContent } from '../components/LostAuthenticatorHelp.jsx'

// Public, sign-in-free page: a user who cannot complete the MFA challenge is
// by definition stuck at aal1, so this page must never require a session.
// It explains the verification process and gives working tel:/mailto: actions.
function LostAuthenticator() {
  return (
    <div className="lg:mx-auto lg:max-w-4xl py-5 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-black text-[#0b2e59] dark:text-white">
        Lost access to your authenticator app?
      </h1>
      <p className="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-300">
        You can get back into your account. Two-factor authentication protects it, so the shop
        will confirm your identity before removing it.
      </p>

      <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-sm">
        <LostAuthenticatorContent />
      </div>

      <p className="mt-5 text-sm text-gray-600 dark:text-gray-300">
        <Link to="/" className="font-semibold text-[#0039a6] hover:text-[#0046cc] underline-offset-2 hover:underline dark:text-yellow-300 dark:hover:text-yellow-200">
          Back to home
        </Link>
        {' '}once you can sign in again.
      </p>
    </div>
  )
}

export default LostAuthenticator
