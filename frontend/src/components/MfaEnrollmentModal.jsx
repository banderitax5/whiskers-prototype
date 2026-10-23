import { useEffect, useRef, useState } from 'react'
import { normalizeOtp, otpError } from '../lib/mfa.js'

function MfaEnrollmentModal({ enrollment, onClose, onVerify, saving, error }) {
  const [verifyCode, setVerifyCode] = useState('')
  const [localError, setLocalError] = useState('')
  const codeRef = useRef(null)

  useEffect(() => {
    setVerifyCode('')
    setLocalError('')
    if (enrollment) {
      const t = setTimeout(() => codeRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
    return undefined
  }, [enrollment])

  if (!enrollment) return null

  const secret = enrollment.secret || ''
  const groupedSecret = secret.match(/.{1,4}/g)?.join(' ') || secret
  const shownError = localError || error || ''

  function submit(e) {
    e.preventDefault()
    const code = normalizeOtp(verifyCode)
    const problem = otpError(code)
    if (problem) {
      setLocalError(problem)
      return
    }
    setLocalError('')
    onVerify(code)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[10050]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-enroll-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in duration-300 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="w-full p-5 sm:p-6 relative">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            aria-label="Close enrollment"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex justify-center mb-1">
            <img src="/logo/logo-whiskers.png" alt="Whiskers" className="h-11 sm:h-12" />
          </div>

          <h2 id="mfa-enroll-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
            Set up two-factor authentication
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
            Scan the QR code with an authenticator app such as Google Authenticator, Authy, or 1Password.
          </p>

          {enrollment.qrCode ? (
            <div className="flex justify-center mb-4">
              <img
                src={enrollment.qrCode}
                alt="QR code for authenticator app"
                className="w-48 h-48 bg-white p-2 rounded-lg border"
              />
            </div>
          ) : (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              The QR code could not be generated. Add the secret key below to your app manually.
            </p>
          )}

          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Secret key (manual entry)</p>
            <code className="break-all text-sm font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-2 py-1 rounded">
              {groupedSecret}
            </code>
          </div>

          <form onSubmit={submit}>
            <label htmlFor="mfa-enroll-code" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ENTER THE 6-DIGIT CODE FROM YOUR APP
            </label>
            <input
              ref={codeRef}
              type="text"
              id="mfa-enroll-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => { setVerifyCode(normalizeOtp(e.target.value)); setLocalError('') }}
              autoComplete="one-time-code"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-center focus:ring-2 focus:ring-[#0b2e59] dark:focus:ring-yellow-400 transition-colors text-lg tracking-widest"
              placeholder="000000"
              aria-invalid={shownError ? 'true' : undefined}
              aria-describedby={shownError ? 'mfa-enroll-error' : undefined}
              required
            />
            <div className="min-h-[1.75rem]">
              {shownError && (
                <p id="mfa-enroll-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {shownError}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || normalizeOtp(verifyCode).length !== 6}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0b2e59] hover:bg-[#15407a] active:scale-[0.98] text-white font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving ? 'Verifying…' : 'Verify and turn on'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default MfaEnrollmentModal
