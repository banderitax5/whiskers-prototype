import { useEffect, useRef, useState } from 'react'
import supabase from '../lib/supabase'
import { normalizeOtp, otpError } from '../lib/mfa.js'
import LostAuthenticatorHelp from './LostAuthenticatorHelp.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// Shown by the admin gate when the account has a verified second factor but
// the restored session is still aal1 (for example a session created before
// enrollment). Verifying here upgrades the session in place, so the dashboard
// opens without forcing a full sign-out round-trip.
function MfaVerifyGate({ onVerified }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  // prefill the account email in the recovery email so the shop can find the
  // account quickly (the session here is aal1 but still identifies the user)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession()
      .then(({ data }) => { if (!cancelled) setEmail(data?.session?.user?.email || '') })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    const clean = normalizeOtp(code)
    const problem = otpError(clean)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Your sign-in expired. Please sign in again.')
        return
      }
      const res = await fetch(`${API_BASE}/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code: clean }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verification failed')
      }
      const data = await res.json().catch(() => ({}))
      if (!data.session?.access_token) throw new Error('Verification did not return a session. Please sign in again.')

      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (setErr) throw setErr

      onVerified?.()
    } catch (err) {
      setError(err.message || 'Invalid code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.assign('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-lg border border-yellow-300 bg-white p-6 shadow dark:border-yellow-700 dark:bg-gray-800">
        <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Verify your sign-in</h1>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Enter the 6-digit code from your authenticator app to open the dashboard.
        </p>
        <form onSubmit={submit} className="space-y-3 text-left">
          <div>
            <label htmlFor="gate-mfa-code" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              TOTP CODE
            </label>
            <input
              ref={inputRef}
              id="gate-mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(normalizeOtp(e.target.value)); setError('') }}
              autoComplete="one-time-code"
              required
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'gate-mfa-error' : undefined}
              className="w-full rounded-lg border border-gray-500 bg-white px-4 py-2 text-center tracking-widest text-gray-900 focus:border-transparent focus:ring-2 focus:ring-yellow-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          {error && (
            <p id="gate-mfa-error" role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:bg-red-900 dark:text-red-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-yellow-500 px-4 py-2 text-sm font-medium text-[#0b2e59] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
        <LostAuthenticatorHelp email={email} className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700" />
        <button
          type="button"
          onClick={signOut}
          className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Sign out instead
        </button>
      </div>
    </div>
  )
}

export default MfaVerifyGate
