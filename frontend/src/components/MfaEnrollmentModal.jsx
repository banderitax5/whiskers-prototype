import { useEffect, useRef, useState } from 'react'
import { BsCheck2, BsClipboard } from 'react-icons/bs'
import { normalizeOtp, otpError, qrImageSrc } from '../lib/mfa.js'
import OtpInput from './OtpInput.jsx'


function MfaEnrollmentModal({ enrollment, onClose, onVerify, saving, error }) {
  const [verifyCode, setVerifyCode] = useState('')
  const [localError, setLocalError] = useState('')
  const [qrBroken, setQrBroken] = useState(false)
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef(null)
  const copyTimer = useRef(null)

  useEffect(() => {
    setVerifyCode('')
    setLocalError('')
    setQrBroken(false)
    setCopied(false)
  }, [enrollment])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  // Escape closes unless verification is in flight; Tab cycles inside the
  // dialog so keyboard focus never escapes behind the overlay.
  useEffect(() => {
    if (!enrollment) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        if (!saving) onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enrollment, saving, onClose])

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

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setLocalError('Could not copy the secret. Select it and copy manually.')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[10050]"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-enroll-title"
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in duration-300 max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
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

          {enrollment.qrCode && !qrBroken ? (
            <div className="flex justify-center mb-4">
              <img
                src={qrImageSrc(enrollment.qrCode)}
                alt="QR code for authenticator app"
                onError={() => setQrBroken(true)}
                className="w-48 h-48 bg-white p-2 rounded-lg border"
              />
            </div>
          ) : (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              We could not show the QR code. Add the secret key below to your app manually.
            </p>
          )}

          <div className="mb-4 rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-700/50">
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Secret key (manual entry)</p>
            <div className="mx-auto flex max-w-full items-center gap-2 rounded bg-white px-2 py-1 dark:bg-gray-800">
              <code className="min-w-0 flex-1 break-all text-left font-mono text-sm text-gray-900 dark:text-gray-100">
                {groupedSecret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                disabled={saving}
                title="Copy secret key"
                aria-label="Copy secret key"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              >
                {copied ? <BsCheck2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <BsClipboard className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 min-h-[1rem] text-[11px] text-green-700 dark:text-green-400" role="status" aria-live="polite">
              {copied ? 'Copied to clipboard' : ''}
            </p>
          </div>

          <form onSubmit={submit}>
            <label htmlFor="mfa-enroll-code" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ENTER THE 6-DIGIT CODE FROM YOUR APP
            </label>
            <OtpInput
              id="mfa-enroll-code"
              value={verifyCode}
              onChange={(next) => { setVerifyCode(next); setLocalError('') }}
              onComplete={(code) => { setLocalError(''); onVerify(code) }}
              disabled={saving}
              autoFocus
              ariaInvalid={Boolean(shownError)}
              ariaDescribedby={shownError ? 'mfa-enroll-error' : undefined}
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
