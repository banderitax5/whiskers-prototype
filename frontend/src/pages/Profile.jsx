import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import supabase from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

async function fetchWithAuth(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${session.access_token}`,
  }

  if (options.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState(undefined)
  const [fieldErrors, setFieldErrors] = useState({})

  // validation rules — returns error message or ''
  function validateName(value, label) {
    const v = value.trim()
    if (!v) return `${label} is required.`
    if (v.length < 2) return `${label} must be at least 2 characters.`
    if (!/[a-zA-Z]/.test(v)) return `${label} must contain at least one letter.`
    return ''
  }

  function validatePhone(value) {
    const digits = value.replace(/[^0-9]/g, '')
    if (!digits) return 'Phone number is required.'
    if (digits.length < 11) return 'Phone number must have at least 11 digits.'
    if (digits.length > 15) return 'Phone number must have at most 15 digits.'
    return ''
  }

  function validateAddress(value) {
    const v = value.trim()
    if (!v) return '' // optional
    if (v.length < 5) return 'Address must be at least 5 characters.'
    return ''
  }

  function validatePostalCode(value) {
    const v = value.trim()
    if (!v) return '' // optional
    if (!/^[0-9]{4}$/.test(v)) return 'Postal code must be exactly 4 digits.'
    return ''
  }

  function validateAll() {
    const errors = {}
    errors.firstName = validateName(profile.firstName || '', 'First name')
    errors.lastName = validateName(profile.lastName || '', 'Last name')
    errors.phone = validatePhone(profile.phone || '')
    errors.addressLine1 = validateAddress(profile.addressLine1 || '')
    errors.postalCode = validatePostalCode(profile.postalCode || '')
    if (!profile.province) errors.province = 'Province is required.'
    if (profile.province && !profile.city) errors.city = 'City is required.'
    setFieldErrors(errors)
    return Object.values(errors).some(Boolean)
  }

  const philippinesData = {
    "Metro Manila": [
      "Quezon City","Manila","Makati","Taguig","Pasig","Mandaluyong",
      "Pasay","Parañaque","Las Piñas","Caloocan","Marikina",
      "Valenzuela","San Juan","Malabon","Navotas","Pateros"
    ],
    "Cebu": ["Cebu City","Mandaue","Lapu-Lapu"],
    "Davao del Sur": ["Davao City"]
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (!s) { setLoading(false); return }

      fetchWithAuth('/profile')
        .then(setProfile)
        .catch((err) => toast.error(err.message || 'Failed to load profile'))
        .finally(() => setLoading(false))
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!profile) return

    if (validateAll()) {
      toast.error('Please fix the errors before saving.')
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
      toast.success('Profile saved successfully.')
    } catch (err) {
      toast.error(err.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (session === null && !loading) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12 text-gray-600 dark:text-gray-300">
        Loading profile...
      </div>
    )
  }

  const inputClass =
    'w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#0b2e59] focus:ring-1 focus:ring-[#0b2e59] transition-colors outline-none dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:placeholder:text-gray-500 text-sm sm:text-base'

  const labelClass =
    'block text-sm font-medium text-gray-600 mb-1.5 dark:text-gray-300'

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-3 sm:px-4 bg-white dark:bg-gray-900 min-h-screen">

      <div className="mb-5 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold text-[#0b2e59] dark:text-yellow-300 tracking-tight">
          Profile
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400 text-xs sm:text-base">
          Complete your profile so we can use your information for orders and delivery.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

        <div className="p-4 sm:p-8 space-y-5 sm:space-y-6">

          {/* PERSONAL */}
          <section className="space-y-3 sm:space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Personal
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className={labelClass}>First Name</label>
                <input
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
          <section className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-700">

            <div>
              <label className={labelClass}>Address Line 1</label>
              <input
                className={inputClass}
                placeholder="e.g. 123 Main St, Block 5"
                value={profile?.addressLine1 ?? ''}
                onChange={(e)=>setProfile(p=>({...p,addressLine1:e.target.value}))}
              />
            </div>

            <div>
              <label className={labelClass}>Address Line 2 (optional)</label>
              <input
                className={inputClass}
                placeholder="e.g. Apt 4B, Floor 2 (optional)"
                value={profile?.addressLine2 ?? ''}
                onChange={(e)=>setProfile(p=>({...p,addressLine2:e.target.value}))}
              />
            </div>

            {/* Province + City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className={labelClass}>Province / State</label>
                <select
                  className={inputClass}
                  value={profile?.province ?? ''}
                  onChange={(e)=>setProfile(p=>({...p,province:e.target.value,city:''}))}
                >
                  <option value="">Select Province</option>
                  {Object.keys(philippinesData).map(p=><option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className={labelClass}>City</label>
                <select
                  className={inputClass}
                  value={profile?.city ?? ''}
                  onChange={(e)=>setProfile(p=>({...p,city:e.target.value}))}
                  disabled={!profile?.province}
                >
                  <option value="">Select City</option>
                  {(philippinesData[profile?.province]||[]).map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Postal */}
            <div>
              <label className={labelClass}>Postal Code</label>
              <input
                className={inputClass}
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

        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-700 border-t">
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
  )
}

export default Profile
