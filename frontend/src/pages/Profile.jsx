import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
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
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [session, setSession] = useState(undefined)
  const [fieldErrors, setFieldErrors] = useState({})

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
        .catch((err) => setError(err.message || 'Failed to load profile'))
        .finally(() => setLoading(false))
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!profile) return

    setError('')
    setSuccess('')
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
          country: profile.country,
        }),
      })

      setProfile(updated)
      setSuccess('Profile saved successfully.')
    } catch (err) {
      setError(err.message || 'Failed to save profile')
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
    'w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#0b2e59] focus:ring-1 focus:ring-[#0b2e59] transition-colors outline-none dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:placeholder:text-gray-500'

  const labelClass =
    'block text-sm font-medium text-gray-600 mb-1.5 dark:text-gray-300'

  return (
    <div className="max-w-2xl mx-auto py-6 bg-white dark:bg-gray-900 min-h-screen">

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          Profile
        </h1>
        <p className="mt-1.5 text-gray-500 dark:text-gray-400 text-sm sm:text-base">
          Complete your profile so we can use your information for orders and delivery.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

        <div className="p-6 sm:p-8 space-y-6">

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* PERSONAL */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Personal
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First Name</label>
                <input
                  className={inputClass}
                  value={profile?.firstName ?? ''}
                  onChange={(e)=>setProfile(p=>({...p,firstName:e.target.value}))}
                />
              </div>

              <div>
                <label className={labelClass}>Last Name</label>
                <input
                  className={inputClass}
                  value={profile?.lastName ?? ''}
                  onChange={(e)=>setProfile(p=>({...p,lastName:e.target.value}))}
                />
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
              className={inputClass}
              placeholder="e.g. 09XX XXX XXXX"
              value={profile?.phone ?? ''}
              onChange={(e)=>{
                const value=e.target.value
                if(!/^[0-9]*$/.test(value)){
                  setFieldErrors(p=>({...p,phone:'Invalid entry. Ex. 09123129312'}))
                } else {
                  setFieldErrors(p=>({...p,phone:''}))
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Country */}
            <div>
              <label className={labelClass}>Country</label>
              <select
                className={inputClass}
                value={profile?.country ?? ''}
                onChange={(e)=>setProfile(p=>({...p,country:e.target.value}))}
              >
                <option value="">Select Country</option>
                <option value="Philippines">Philippines</option>
              </select>
            </div>

          </section>

        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[#dbb727] hover:bg-[#0d3a6e] text-white font-semibold"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

      </form>
    </div>
  )
}

export default Profile
