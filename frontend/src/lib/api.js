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

export async function getHealth() {
  return apiGet('/health')
}


