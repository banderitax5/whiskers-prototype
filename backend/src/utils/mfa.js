'use strict'

// Supabase-native multi-factor authentication (TOTP).
//
// GoTrue owns the factor lifecycle: the secret is generated and stored by
// Supabase (encrypted at rest), challenges are single-use, and a successful
// verification returns an upgraded session whose `aal` claim is `aal2`.
// The backend never generates or stores TOTP secrets itself.
//
// These helpers are intentionally thin: pure inspection functions for tests,
// plus a small REST client so the Express layer can act with the caller's own
// access token (GoTrue requires the user JWT for enroll/challenge/verify).

const AUTH_TIMEOUT_MS = 8000

function authBaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || ''
}

// True when the account has at least one verified MFA factor. GoTrue returns
// `user.factors` on GET /user and on password sign-in after enrollment.
export function hasVerifiedFactor(user) {
  return verifiedFactors(user).length > 0
}

export function verifiedFactors(user) {
  const factors = user?.factors
  if (!Array.isArray(factors)) return []
  return factors.filter((f) => f && f.status === 'verified')
}

// Reads the `aal` claim from an access token. Only call this with a token whose
// signature was already validated (auth middleware calls auth.getUser first),
// so decoding the payload without re-verifying is safe.
export function aalFromToken(token) {
  if (typeof token !== 'string') return null
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}

async function gotrue(path, { token, method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  try {
    const res = await fetch(`${authBaseUrl()}/auth/v1${path}`, {
      method,
      headers: {
        apikey: anonKey(),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(
        data.msg || data.message || data.error_description || data.error || `Authentication request failed (${res.status})`
      )
      err.status = res.status
      err.code = data.error_code || data.code || null
      throw err
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeout = new Error('Authentication service timed out. Please try again.')
      timeout.status = 504
      throw timeout
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Starts TOTP enrollment. Returns { id, totp: { qr_code, secret, uri } }.
export function enrollTotp(token, friendlyName = 'Whiskers Pet Shop') {
  return gotrue('/factors', {
    token,
    method: 'POST',
    body: { factor_type: 'totp', friendly_name: friendlyName },
  })
}

// Creates a single-use challenge for a factor.
export function challengeTotp(token, factorId) {
  return gotrue(`/factors/${encodeURIComponent(factorId)}/challenge`, {
    token,
    method: 'POST',
    body: {},
  })
}

// Verifies a code and returns the upgraded (aal2) session.
export function verifyTotp(token, factorId, challengeId, code) {
  return gotrue(`/factors/${encodeURIComponent(factorId)}/verify`, {
    token,
    method: 'POST',
    body: { challenge_id: challengeId, code },
  })
}

// Removes a factor from the caller's account.
export function unenrollFactor(token, factorId) {
  return gotrue(`/factors/${encodeURIComponent(factorId)}`, { token, method: 'DELETE' })
}
