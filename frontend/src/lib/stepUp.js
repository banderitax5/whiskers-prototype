// Step-up (password re-verification) state for sensitive admin actions.
// The token is kept in memory only and expires server-side after a few minutes.

let cached = null // { token, expiresAt }
let pending = null // { promise, resolve, reject }
const listeners = new Set()

// StepUpModal registers a listener to be told when verification is needed
export function onStepUpRequest(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function clearStepUp() {
  cached = null
}

// returns the cached token if still fresh (with a 5s safety margin), else null
export function peekStepUpToken() {
  if (!cached) return null
  if (new Date(cached.expiresAt).getTime() <= Date.now() + 5000) {
    cached = null
    return null
  }
  return cached.token
}

// Resolves with a valid step-up token, prompting for a password if needed
export function ensureStepUp(accessToken) {
  const valid = peekStepUpToken()
  if (valid) return Promise.resolve(valid)
  if (!pending) {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    pending = { promise, resolve, reject }
  }
  const { promise } = pending
  listeners.forEach((listener) => listener({ accessToken }))
  return promise
}

// Called by StepUpModal on successful password verification
export function resolveStepUp(stepUpToken, expiresAt) {
  cached = { token: stepUpToken, expiresAt }
  const current = pending
  pending = null
  current?.resolve(stepUpToken)
}

// Called by StepUpModal when the user cancels or verification fails permanently
export function rejectStepUp(err) {
  const current = pending
  pending = null
  current?.reject(err || new Error('Verification cancelled'))
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// POST /api/auth/step-up — verifies the password and stores the new token
export async function verifyStepUp(accessToken, password) {
  const res = await fetch(`${API_BASE}/auth/step-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || 'Verification failed. Try again.')
    err.status = res.status
    throw err
  }
  const data = await res.json().catch(() => ({}))
  resolveStepUp(data.stepUpToken, data.expiresAt)
  return data
}
