// base URL for backend API calls - defaults to /api which gets proxied
// to localhost:3001 by vite's dev server proxy config
const apiBase = import.meta.env.VITE_API_BASE || '/api'

// simple GET request to the backend - no auth needed
// used for public stuff like health checks
export async function apiGet(path) {
  const response = await fetch(`${apiBase}${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

// export async function apiPost(path, body) {
//   const response = await fetch(`${apiBase}${path}`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(body),
//   })
//   const data = await response.json().catch(() => ({}))
//   if (!response.ok) {
//     throw new Error(data.error || `HTTP ${response.status}`)
//   }
//   return data
// }

// function getAuthHeaders(includeJson = false) {
//   const token = localStorage.getItem('token')
//   const headers = {}
//   if (token) headers.Authorization = `Bearer ${token}`
//   if (includeJson) headers['Content-Type'] = 'application/json'
//   return headers
// }

// export async function apiGetAuth(path) {
//   const response = await fetch(`${apiBase}${path}`, {
//     headers: getAuthHeaders(),
//   })
//   const data = await response.json().catch(() => ({}))
//   if (!response.ok) {
//     throw new Error(data.error || `HTTP ${response.status}`)
//   }
//   return data
// }

// export async function apiPutAuth(path, body) {
//   const response = await fetch(`${apiBase}${path}`, {
//     method: 'PUT',
//     headers: getAuthHeaders(true),
//     body: JSON.stringify(body),
//   })
//   const data = await response.json().catch(() => ({}))
//   if (!response.ok) {
//     throw new Error(data.error || `HTTP ${response.status}`)
//   }
//   return data
// }

// export async function getHealth() {
//   return apiGet('/health')
// }

// checks if the backend is running
export async function getHealth() {
  return apiGet('/health')
}


