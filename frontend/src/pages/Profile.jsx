import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import supabase from '../lib/supabase'

// base URL for our custom backend API - vite proxies /api to localhost:3001
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// helper that makes authenticated requests to our backend
// grabs the current supabase session, pulls the access_token out of it,
// and slaps it into the Authorization header so the backend can verify who's calling
// this is how we bridge supabase auth on the frontend with our custom express backend
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

// the profile page - lets users view and edit their personal info
// all the data is encrypted on the backend (AES-256-GCM) so the backend
// decrypts it before sending it here, and re-encrypts when we save
function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // starts as undefined so we can tell the difference between
  // "still checking" and "definitely not logged in"
  const [session, setSession] = useState(undefined)

  // on mount, check if the user has a valid supabase session
  // if they do, fetch their profile from the backend
  // if not, we'll redirect them to home (see the Navigate below)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (!s) { setLoading(false); return }
      // GET /api/profile - backend decrypts the profile fields and sends them back
      fetchWithAuth('/profile')
        .then(setProfile)
        .catch((err) => setError(err.message || 'Failed to load profile'))
        .finally(() => setLoading(false))
    })
  }, [])

  // fires when the user clicks "Save Profile"
  // sends all the profile fields to PUT /api/profile
  // the backend encrypts everything before upserting into the profiles table
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

  // no session and done loading = not logged in, send them home
  if (session === null && !loading) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <p className="text-gray-600">Loading profile...</p>
      </div>
    )
  }

  // if we got an error and there's no profile data at all, show an error page
  // instead of a half-broken form
  if (error && !profile) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
        <p className="mt-4 text-sm text-gray-600">
          <a href="/" className="text-blue-600 hover:underline">Return to home</a>
        </p>
      </div>
    )
  }

  // reusable tailwind classes so we don't repeat ourselves 50 times
  const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#0b2e59] focus:ring-1 focus:ring-[#0b2e59] transition-colors outline-none'
  const labelClass = 'block text-sm font-medium text-gray-600 mb-1.5'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Profile</h1>
        <p className="mt-1.5 text-gray-500 text-sm sm:text-base">Complete your profile so we can use your information for orders and delivery.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-lg text-sm" role="alert">
              {success}
            </div>
          )}

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Personal</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className={labelClass}>First Name</label>
                <input
                  type="text"
                  id="firstName"
                  value={profile?.firstName ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="lastName" className={labelClass}>Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  value={profile?.lastName ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <div className="px-4 py-2.5 rounded-lg border border-gray-100 bg-gray-50 text-gray-600 text-sm">
                {profile?.email ?? ''}
              </div>
              <p className="mt-1 text-xs text-gray-400">Email cannot be changed.</p>
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Contact</h2>
            <div>
              <label htmlFor="phone" className={labelClass}>Phone</label>
              <input
                type="tel"
                id="phone"
                value={profile?.phone ?? ''}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="e.g. 09XX XXX XXXX"
                className={inputClass}
              />
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Address</h2>
            <div>
              <label htmlFor="addressLine1" className={labelClass}>Address Line 1</label>
              <input
                type="text"
                id="addressLine1"
                value={profile?.addressLine1 ?? ''}
                onChange={(e) => setProfile((p) => ({ ...p, addressLine1: e.target.value }))}
                placeholder="Street address, P.O. box"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="addressLine2" className={labelClass}>Address Line 2 <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                id="addressLine2"
                value={profile?.addressLine2 ?? ''}
                onChange={(e) => setProfile((p) => ({ ...p, addressLine2: e.target.value }))}
                placeholder="Apartment, suite, building, floor, etc."
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="city" className={labelClass}>City</label>
                <input
                  type="text"
                  id="city"
                  value={profile?.city ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="province" className={labelClass}>Province / State</label>
                <input
                  type="text"
                  id="province"
                  value={profile?.province ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, province: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="postalCode" className={labelClass}>Postal Code</label>
                <input
                  type="text"
                  id="postalCode"
                  value={profile?.postalCode ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, postalCode: e.target.value }))}
                  placeholder="e.g. 1000"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="country" className={labelClass}>Country</label>
                <input
                  type="text"
                  id="country"
                  value={profile?.country ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}
                  placeholder="e.g. Philippines"
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="px-6 sm:px-8 py-4 bg-gray-50/80 border-t border-gray-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[#dbb727] hover:bg-[#0d3a6e] text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Profile
