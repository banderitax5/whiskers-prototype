import { ensureStepUp, peekStepUpToken } from './stepUp'

// base URL for backend API calls - defaults to /api which gets proxied
// to the backend by vite's dev server proxy config
const apiBase = import.meta.env.VITE_API_BASE || '/api'

async function send(path, { method = 'GET', body, token, stepUpToken, isForm = false } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  // attach a cached step-up token to authenticated requests when we have one
  const effectiveStepUp = stepUpToken ?? (token ? peekStepUpToken() : null)
  if (effectiveStepUp) headers['X-Step-Up-Token'] = effectiveStepUp
  let payload = body
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${apiBase}${path}`, { method, headers, body: payload })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function toError(res, data) {
  const err = new Error(data.error || `HTTP ${res.status}`)
  err.status = res.status
  err.code = data.code
  return err
}

async function request(path, opts = {}) {
  let { res, data } = await send(path, opts)

  // sensitive admin actions require step-up: prompt for the password once
  // (result is cached for a few minutes) and retry the same request
  if (!res.ok && data.code === 'STEP_UP_REQUIRED' && opts.token) {
    let stepUpToken
    try {
      stepUpToken = await ensureStepUp(opts.token)
    } catch (err) {
      const e = new Error(err.message || 'Verification cancelled')
      e.code = 'STEP_UP_REQUIRED'
      throw e
    }
    ;({ res, data } = await send(path, { ...opts, stepUpToken }))
  }

  if (!res.ok) throw toError(res, data)
  return data
}

// public (no auth)
export const apiGet = (path) => request(path)
export const apiPost = (path, body) => request(path, { method: 'POST', body })

// authed helpers - pass the current Supabase access token
export const apiGetAuth = (path, token) => request(path, { token })
export const apiPostAuth = (path, body, token) => request(path, { method: 'POST', body, token })
export const apiPutAuth = (path, body, token) => request(path, { method: 'PUT', body, token })
export const apiPatchAuth = (path, body, token) => request(path, { method: 'PATCH', body, token })
export const apiDeleteAuth = (path, token) => request(path, { method: 'DELETE', token })

// admin lists are capped at 100 rows per page server-side; walk every page so
// counts, filters and searches computed in the UI see the whole dataset
export async function apiGetAllPages(path, token, { pageSize = 100, maxPages = 100 } = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const items = []
  for (let page = 1; page <= maxPages; page++) {
    const data = await request(`${path}${sep}page=${page}&pageSize=${pageSize}`, { token })
    const chunk = data.items || []
    items.push(...chunk)
    if (chunk.length === 0 || items.length >= (data.total ?? items.length)) break
  }
  return { items, total: items.length }
}

// file upload helper - sends FormData (multipart) or JSON for URL fetch
export function apiUploadAuth(path, body, token) {
  const isForm = body instanceof FormData
  return request(path, { method: 'POST', body, token, isForm })
}

// raw Response for non-JSON downloads (CSV export); throws like request()
export async function apiFetchAuth(path, token) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${apiBase}${path}`, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw toError(res, data)
  }
  return res
}
