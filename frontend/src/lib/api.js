const apiBase = import.meta.env.VITE_API_BASE || '/api'

export async function apiGet(path) {
  const response = await fetch(`${apiBase}${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

export async function getHealth() {
  return apiGet('/health')
}


