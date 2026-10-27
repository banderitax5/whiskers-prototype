import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import toast from '../lib/toast.js'
import supabase from '../lib/supabase'
import { philippinesData } from '../data/philippinesData.js'
import { phoneError, addressLineError, postalError } from '../lib/addressValidation.js'
import MfaEnrollmentModal from '../components/MfaEnrollmentModal'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const SHELL = 'max-w-2xl mx-auto py-4 sm:py-6 bg-white dark:bg-gray-900 min-h-screen'
const HEADER = 'mb-5 sm:mb-8'
const CARD = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden'
const CARD_BODY = 'p-4 sm:p-8 space-y-5 sm:space-y-6'
const GRID2 = 'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'
const PULSE = 'bg-gray-200 dark:bg-gray-700 rounded animate-pulse'
const ADDRESS_SECTION = 'space-y-4 pt-2 border-t border-gray-100 dark:border-gray-700'
const FOOTER = 'px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-700 border-t'
const FIELD = 'space-y-1.5'
const LABEL_BAR = `${PULSE} h-5 w-24`

function FieldSkeleton({ readOnly = false }) {
  return (
    <div className={FIELD}>
      <div className={LABEL_BAR} />
      <div className={`${PULSE} ${readOnly ? 'h-[46px]' : 'h-[38px] sm:h-[46px]'} w-full rounded-lg`} />
    </div>
  )
}

async function fetchWithAuth(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${session.access_token}`,
  }

  if (options.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json().catch(() => ({}))
}

function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState(undefined)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaEnrollment, setMfaEnrollment] = useState(null)
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const [confirmMfaOff, setConfirmMfaOff] = useState(false)

  // make auth failures readable for the user
  function readableError(err, fallback) {
    const msg = err?.message || fallback
    if (msg === 'Not authenticated' || msg === 'JWT expired' || /token|jwt|session/i.test(msg)) {
      return 'Your session has expired. Please log in again to save your profile.'
    }
    return msg
  }

  // validation rules — returns error message or ''
  function validateName(value, label) {
    const v = value.trim()
    if (!v) return `${label} is required.`
    if (v.length < 2) return `${label} must be at least 2 characters.`
    if (!/[a-zA-Z]/.test(v)) return `${label} must contain at least one letter.`
    return ''
  }

  function validatePhone(value) {
    return phoneError(value, { required: true })
  }

  function validateAddress(value) {
    return addressLineError(value, { required: false }) // optional at profile
  }

  function validateAddressLine2(value) {
    return addressLineError(value, { required: false })
  }

  function validatePostalCode(value) {
    return postalError(value, { required: false })
  }

  function validateAll() {
    const errors = {}
    errors.firstName = validateName(profile.firstName || '', 'First name')
    errors.lastName = validateName(profile.lastName || '', 'Last name')
    errors.phone = validatePhone(profile.phone || '')
    errors.addressLine1 = validateAddress(profile.addressLine1 || '')
    errors.addressLine2 = validateAddressLine2(profile.addressLine2 || '')
    errors.postalCode = validatePostalCode(profile.postalCode || '')
    if (!profile.province) errors.province = 'Province is required.'
    if (profile.province && !profile.city) errors.city = 'City is required.'
    setFieldErrors(errors)
    return errors
  }

  // ordered list of field names for scroll-to-first-error
  const FIELD_ORDER = ['firstName', 'lastName', 'phone', 'addressLine1', 'addressLine2', 'province', 'city', 'postalCode']

  function scrollToFirstError(errors) {
    const first = FIELD_ORDER.find(k => errors[k])
    if (!first) return
    const el = document.querySelector(`[data-field="${first}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (typeof el.focus === 'function') el.focus({ preventScroll: true })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (!s) { setLoading(false); return }

      fetchWithAuth('/profile')
        .then(p => {
          setProfile(p)
          setMfaEnabled(p.mfaEnabled ?? p.mfa_enabled ?? false)
        })
        .catch((err) => {
          const msg = readableError(err, 'Failed to load profile')
          setFormError(msg)
          toast.error(msg)
        })
        .finally(() => setLoading(false))
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!profile) return

    setFormError('')

    const errors = validateAll()
    const hasErrors = Object.values(errors).some(Boolean)
    if (hasErrors) {
      toast.error('Please fix the errors before saving.')
      scrollToFirstError(errors)
      return
    }

    setSaving(true)

    try {
      const updated = await fetchWithAuth('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          addressLine1: profile.addressLine1,
          addressLine2: profile.addressLine2,
          city: profile.city,
          province: profile.province,
          postalCode: profile.postalCode,
        }),
      })

      setProfile(updated)
      setFormError('')
      toast.success('Profile saved successfully.')
    } catch (err) {
      const msg = readableError(err, 'Failed to save profile')
      setFormError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleMfaEnroll() {
    setMfaBusy(true)
    setMfaError('')
    try {
      const data = await fetchWithAuth('/auth/mfa/enroll', { method: 'POST' })
      setMfaEnrollment({
        factorId: data.factorId,
        secret: data.secret,
        qrCode: data.qrCode,
        uri: data.uri,
      })
    } catch (err) {
      const msg = readableError(err, 'Could not start two-factor setup.')
      toast.error(msg)
    } finally {
      setMfaBusy(false)
    }
  }

  async function handleMfaEnrollVerify(code) {
    setMfaBusy(true)
    setMfaError('')
    try {
      const data = await fetchWithAuth('/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      if (!data.session) throw new Error('Verification did not return a session. Please log in again.')
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (setErr) throw setErr

      setMfaEnabled(true)
      setMfaEnrollment(null)
      toast.success('Two-factor authentication is on.')
    } catch (err) {
      setMfaError(readableError(err, 'Invalid code. Try again.'))
    } finally {
      setMfaBusy(false)
    }
  }

  function handleMfaEnrollCancel() {
    setMfaEnrollment(null)
    setMfaError('')
  }

  async function handleMfaDisable() {
    setMfaBusy(true)
    try {
      await fetchWithAuth('/auth/mfa/unenroll', { method: 'POST' })
      setMfaEnabled(false)
      setConfirmMfaOff(false)
      toast.success('Two-factor authentication is off.')
    } catch (err) {
      toast.error(readableError(err, 'Could not turn off two-factor authentication.'))
    } finally {
      setMfaBusy(false)
    }
  }

  if (session === null && !loading) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <>
      <span role="status" className="sr-only">Loading...</span>
      <div className={SHELL} aria-hidden="true">
        <div className={HEADER}>
          <div className={`${PULSE} h-7 sm:h-9 w-28`} />
          <div className={`${PULSE} h-8 sm:h-6 w-full sm:w-11/12 mt-1`} />
        </div>
        <div className={CARD}>
          <div className={CARD_BODY}>
            <section className="space-y-3 sm:space-y-4">
              <div className={`${PULSE} h-5 w-20`} />
              <div className={GRID2}>
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
              <FieldSkeleton readOnly />
            </section>

            <section>
              <FieldSkeleton />
            </section>

            <section className={ADDRESS_SECTION}>
              <FieldSkeleton />
              <FieldSkeleton />
              <div className={GRID2}>
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
              <FieldSkeleton />
            </section>
          </div>

          <div className={FOOTER}>
            <div className={`${PULSE} h-11 sm:h-12 w-full sm:w-36 rounded-lg`} />
          </div>
        </div>
      </div>
      </>
    )
  }

  const inputClass =
    'w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#0b2e59] focus:ring-1 focus:ring-[#0b2e59] transition-colors outline-none dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:placeholder:text-gray-500 text-sm sm:text-base'

  const labelClass =
    'block text-sm font-medium text-gray-600 mb-1.5 dark:text-gray-300'

  return (
    <>
    <div className={SHELL}>

      <div className={HEADER}>
        <h1 className="text-xl sm:text-3xl font-bold text-[#0b2e59] dark:text-yellow-300 tracking-tight">
          Profile
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400 text-xs sm:text-base">
          Complete your profile so we can use your information for orders and delivery.
        </p>
      </div>

      <form onSubmit={handleSubmit} className={CARD}>

        <div className={CARD_BODY}>

          {formError && (
            <div
              className="flex items-start justify-between gap-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800 px-3 py-2 rounded-lg"
              role="alert"
            >
              <span>{formError}</span>
              <button
                type="button"
                onClick={() => setFormError('')}
                aria-label="Dismiss error"
                className="shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* PERSONAL */}
          <section className="space-y-3 sm:space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Personal
            </h2>

            <div className={GRID2}>
              <div>
                <label className={labelClass}>First Name</label>
                <input
                  data-field="firstName"
                  className={`${inputClass} ${fieldErrors.firstName ? 'border-red-500' : ''}`}
                  value={profile?.firstName ?? ''}
                  onChange={(e)=>{
                    setProfile(p=>({...p,firstName:e.target.value}))
                    setFieldErrors(p=>({...p,firstName:validateName(e.target.value,'First name')}))
                  }}
                />
                {fieldErrors.firstName && <p className="text-red-500 text-xs mt-1">{fieldErrors.firstName}</p>}
              </div>

              <div>
                <label className={labelClass}>Last Name</label>
                <input
                  data-field="lastName"
                  className={`${inputClass} ${fieldErrors.lastName ? 'border-red-500' : ''}`}
                  value={profile?.lastName ?? ''}
                  onChange={(e)=>{
                    setProfile(p=>({...p,lastName:e.target.value}))
                    setFieldErrors(p=>({...p,lastName:validateName(e.target.value,'Last name')}))
                  }}
                />
                {fieldErrors.lastName && <p className="text-red-500 text-xs mt-1">{fieldErrors.lastName}</p>}
              </div>
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <div className="px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border">
                {profile?.email ?? ''}
              </div>
            </div>
          </section>

          {/* CONTACT */}
          <section>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              data-field="phone"
              className={`${inputClass} ${fieldErrors.phone ? 'border-red-500' : ''}`}
              placeholder="e.g. 09XX XXX XXXX"
              maxLength={20}
              value={profile?.phone ?? ''}
              onChange={(e)=>{
                const value=e.target.value
                if(!/^[0-9+\-() ]*$/.test(value)){
                  setFieldErrors(p=>({...p,phone:'Only numbers and symbols (+, -, space, parentheses) are allowed'}))
                } else {
                  setFieldErrors(p=>({...p,phone:validatePhone(value)}))
                }
                setProfile(p=>({...p,phone:value}))
              }}
            />
            {fieldErrors.phone && <p className="text-red-500 text-xs mt-1">{fieldErrors.phone}</p>}
          </section>

          {/* ADDRESS */}
          <section className={ADDRESS_SECTION}>

            <div>
              <label className={labelClass}>Address Line 1</label>
              <input
                data-field="addressLine1"
                className={`${inputClass} ${fieldErrors.addressLine1 ? 'border-red-500' : ''}`}
                placeholder="e.g. 123 Main St, Block 5"
                value={profile?.addressLine1 ?? ''}
                onChange={(e)=>{
                  const value = e.target.value
                  setProfile(p=>({...p,addressLine1:value}))
                  setFieldErrors(p=>({...p,addressLine1:validateAddress(value)}))
                }}
              />
              {fieldErrors.addressLine1 && <p className="text-red-500 text-xs mt-1">{fieldErrors.addressLine1}</p>}
            </div>

            <div>
              <label className={labelClass}>Address Line 2 (optional)</label>
              <input
                data-field="addressLine2"
                className={`${inputClass} ${fieldErrors.addressLine2 ? 'border-red-500' : ''}`}
                placeholder="e.g. Apt 4B, Floor 2 (optional)"
                value={profile?.addressLine2 ?? ''}
                onChange={(e)=>{
                  const value = e.target.value
                  setProfile(p=>({...p,addressLine2:value}))
                  setFieldErrors(p=>({...p,addressLine2:validateAddressLine2(value)}))
                }}
              />
              {fieldErrors.addressLine2 && <p className="text-red-500 text-xs mt-1">{fieldErrors.addressLine2}</p>}
            </div>

            {/* Province + City */}
            <div className={GRID2}>
              <div>
                <label className={labelClass}>Province / State</label>
                <select
                  data-field="province"
                  className={`${inputClass} ${fieldErrors.province ? 'border-red-500' : ''}`}
                  value={profile?.province ?? ''}
                  onChange={(e)=>{
                    const value = e.target.value
                    setProfile(p=>({...p,province:value,city:''}))
                    setFieldErrors(p=>({...p,province:value?'':'Province is required.',city:''}))
                  }}
                >
                  <option value="">Select Province</option>
                  {Object.keys(philippinesData).map(p=><option key={p}>{p}</option>)}
                </select>
                {fieldErrors.province && <p className="text-red-500 text-xs mt-1">{fieldErrors.province}</p>}
              </div>

              <div>
                <label className={labelClass}>City</label>
                <select
                  data-field="city"
                  className={`${inputClass} ${fieldErrors.city ? 'border-red-500' : ''}`}
                  value={profile?.city ?? ''}
                  onChange={(e)=>{
                    const value = e.target.value
                    setProfile(p=>({...p,city:value}))
                    setFieldErrors(p=>({...p,city:value?'':'City is required.'}))
                  }}
                  disabled={!profile?.province}
                >
                  <option value="">Select City</option>
                  {(philippinesData[profile?.province]||[]).map(c=><option key={c}>{c}</option>)}
                </select>
                {fieldErrors.city && <p className="text-red-500 text-xs mt-1">{fieldErrors.city}</p>}
              </div>
            </div>

            {/* Postal */}
            <div>
              <label className={labelClass}>Postal Code</label>
              <input
                data-field="postalCode"
                className={`${inputClass} ${fieldErrors.postalCode ? 'border-red-500' : ''}`}
                placeholder="e.g. 1101"
                value={profile?.postalCode ?? ''}
                onChange={(e)=>{
                  const value=e.target.value
                  if(!/^[0-9]*$/.test(value)){
                    setFieldErrors(p=>({...p,postalCode:'Invalid entry. Ex. 1800'}))
                  } else {
                    setFieldErrors(p=>({...p,postalCode:''}))
                  }
                  setProfile(p=>({...p,postalCode:value}))
                }}
              />
              {fieldErrors.postalCode && <p className="text-red-500 text-xs mt-1">{fieldErrors.postalCode}</p>}
            </div>

          </section>

          {/* MFA */}
          <section className="space-y-3 sm:space-y-4 pt-2 border-t border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Two-factor authentication
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-300">
              Add an extra layer of security with a code from your authenticator app. Optional, but recommended for admin and staff accounts. If you lose your device, an administrator can remove the second factor from your account in Supabase.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  mfaEnabled
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${mfaEnabled ? 'bg-green-500' : 'bg-gray-400'}`} aria-hidden="true" />
                {mfaEnabled ? 'On' : 'Off'}
              </span>
              {!mfaEnabled && (
                <button
                  type="button"
                  onClick={handleMfaEnroll}
                  disabled={mfaBusy}
                  className="rounded-lg bg-[#0b2e59] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#15407a] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  {mfaBusy ? 'Starting…' : 'Set up two-factor authentication'}
                </button>
              )}
            </div>

            {mfaEnabled && !confirmMfaOff && (
              <button
                type="button"
                onClick={() => setConfirmMfaOff(true)}
                disabled={mfaBusy}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60 dark:text-red-400 sm:text-sm"
              >
                Turn off two-factor authentication
              </button>
            )}
            {mfaEnabled && confirmMfaOff && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/30">
                <p className="text-xs text-red-700 dark:text-red-300">
                  Turning this off removes the second factor from your account. Continue?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleMfaDisable}
                    disabled={mfaBusy}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {mfaBusy ? 'Turning off…' : 'Yes, turn it off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmMfaOff(false)}
                    disabled={mfaBusy}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

        </div>

        <div className={FOOTER}>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-[#0b2e59] hover:bg-[#15407a] text-white font-semibold text-sm sm:text-base"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

      </form>
    </div>
    {mfaEnrollment && (
      <MfaEnrollmentModal
        enrollment={mfaEnrollment}
        onClose={handleMfaEnrollCancel}
        onVerify={handleMfaEnrollVerify}
        saving={mfaBusy}
        error={mfaError}
      />
    )}
    </>
  )
}

export default Profile
