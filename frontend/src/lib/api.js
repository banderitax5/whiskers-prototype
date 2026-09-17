// base URL for backend API calls - defaults to /api which gets proxied
// to the backend by vite's dev server proxy config
const apiBase = import.meta.env.VITE_API_BASE || '/api'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${apiBase}${path}`, { method, headers, body: payload })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

// public (no auth)
export const apiGet = (path) => request(path)

// authed helpers - pass the current Supabase access token
export const apiGetAuth = (path, token) => request(path, { token })
export const apiPostAuth = (path, body, token) => request(path, { method: 'POST', body, token })
export const apiPutAuth = (path, body, token) => request(path, { method: 'PUT', body, token })
export const apiPatchAuth = (path, body, token) => request(path, { method: 'PATCH', body, token })
export const apiDeleteAuth = (path, token) => request(path, { method: 'DELETE', token })

// file upload helper - sends FormData (multipart) or JSON for URL fetch
export async function apiUploadAuth(path, body, token) {
  const isFormData = body instanceof FormData
  const headers = { Authorization: `Bearer ${token}` }
  if (!isFormData) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers,
    body: isFormData ? body : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}