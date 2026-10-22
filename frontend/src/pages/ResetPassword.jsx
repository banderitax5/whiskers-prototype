import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BsEye, BsEyeSlash } from 'react-icons/bs'
import toast from 'react-hot-toast'
import supabase, { hadRecoveryMarker, RECOVERY_PENDING_KEY } from '../lib/supabase'
import { notifyAuth } from '../lib/authNotice'
import { passwordError } from '../lib/passwordRules'
import PasswordRequirements from '../components/PasswordRequirements.jsx'

function ResetPassword() {
  const [status, setStatus] = useState('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendState, setResendState] = useState('idle')
  const [pending, setPending] = useState(() => localStorage.getItem(RECOVERY_PENDING_KEY) === '1')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    let sawRecovery = false

    function markPending() {
      localStorage.setItem(RECOVERY_PENDING_KEY, '1')
      setPending(true)
      setStatus('ready')
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) {
        sawRecovery = true
        markPending()
      }
    })

    if (hadRecoveryMarker) {
      setStatus('ready')
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!cancelled && session) markPending()
      })
    } else if (localStorage.getItem(RECOVERY_PENDING_KEY) === '1') {
      setStatus('ready')
    } else {
      const timer = setTimeout(() => {
        if (!cancelled && !sawRecovery) setStatus('no-session')
      }, 900)
      return () => {
        cancelled = true
        clearTimeout(timer)
        subscription.unsubscribe()
      }
    }

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const errs = {}
    const pwProblem = passwordError(password)
    if (pwProblem) errs.password = pwProblem
    if (confirm !== password) errs.confirm = 'Passwords do not match.'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateErr) {
      setError(updateErr.message || 'Could not update the password. Request a new link and try again.')
      return
    }
    notifyAuth({
      title: 'Password changed',
      body: 'Your password was updated. Use the new one next time you sign in.',
    })
    localStorage.removeItem(RECOVERY_PENDING_KEY)
    setPending(false)
    navigate('/', { replace: true })
  }

  async function handleResend(e) {
    e.preventDefault()
    if (!resendEmail.trim()) return
    setResendState('sending')
    const { error: sendErr } = await supabase.auth.resetPasswordForEmail(resendEmail.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    })
    if (sendErr) {
      setResendState('idle')
      toast.error(sendErr.message || 'Could not send the email. Try again in a moment.')
      return
    }
    setResendState('sent')
  }

  if (status === 'checking') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Checking your reset link…</p>
      </div>
    )
  }

  if (status === 'no-session') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">This link has expired</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Reset links work once and then stop. Enter your email below and we will send you a fresh one.
            </p>
          </div>

          {resendState === 'sent' ? (
            <p className="text-sm text-green-700 bg-green-50 dark:bg-green-900 dark:text-green-200 px-3 py-2 rounded-lg" role="status">
              If that email has an account, a new reset link is on its way.
            </p>
          ) : (
            <form onSubmit={handleResend} className="space-y-3">
              <label htmlFor="resend-email" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                EMAIL
              </label>
              <input
                type="email"
                id="resend-email"
                placeholder="Enter your email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white dark:bg-gray-700 border-gray-500 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
              <button
                type="submit"
                disabled={resendState === 'sending'}
                className="w-full px-4 py-3 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {resendState === 'sending' ? 'Sending…' : 'Send a new link'}
              </button>
            </form>
          )}

          <Link to="/" className="block text-center text-sm text-[#0039a6] hover:text-[#0046cc] font-semibold transition-colors">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Choose a new password</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Use at least 8 characters, and pick something you do not use on other sites.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 dark:bg-red-900 dark:text-red-200 px-3 py-2 rounded-lg" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              NEW PASSWORD
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="reset-password"
                aria-describedby={password ? 'reset-password-rules' : undefined}
                aria-invalid={fieldErrors.password ? 'true' : undefined}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })) }}
                required
                autoComplete="new-password"
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
            {(password || fieldErrors.password) && (
              <PasswordRequirements value={password} id="reset-password-rules" />
            )}
          </div>

          <div>
            <label htmlFor="reset-confirm" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CONFIRM PASSWORD
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="reset-confirm"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFieldErrors(p => ({ ...p, confirm: '' })) }}
              required
              autoComplete="new-password"
              className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white dark:bg-gray-700 border-gray-500 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            {fieldErrors.confirm && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg bg-[#0039a6] hover:bg-[#0046cc] active:scale-[0.98] text-white font-semibold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>

        {!pending && (
          <Link to="/" className="block text-center text-sm text-[#0039a6] hover:text-[#0046cc] font-semibold transition-colors">
            Back to home
          </Link>
        )}
      </div>
    </div>
  )
}

export default ResetPassword
