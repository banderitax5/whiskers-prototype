const apiBase = import.meta.env.VITE_API_BASE || '/api'

export async function apiGet(path) {
  const response = await fetch(`${apiBase}${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

export async function apiPost(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return data
}

function getAuthHeaders(includeJson = false) {
  const token = localStorage.getItem('token')
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (includeJson) headers['Content-Type'] = 'application/json'
  return headers
}

export async function apiGetAuth(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: getAuthHeaders(),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return data
}

export async function apiPutAuth(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'PUT',
    headers: getAuthHeaders(true),
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return data
}

export async function getHealth() {
  return apiGet('/health')
}


