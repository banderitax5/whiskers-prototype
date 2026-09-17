const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

export function captureUtmParams() {
  const params = new URLSearchParams(window.location.search)
  const utm = {}
  let found = false
  for (const key of UTM_KEYS) {
    const val = params.get(key)
    if (val) { utm[key] = val; found = true }
  }
  if (found) localStorage.setItem('utm_params', JSON.stringify(utm))
  if (document.referrer) localStorage.setItem('utm_referrer', document.referrer)
}

export function getUtmParams() {
  try { return JSON.parse(localStorage.getItem('utm_params') || '{}') }
  catch { return {} }
}

export function trackEvent(eventType, metadata = {}) {
  const payload = {
    event_type: eventType,
    page: window.location.pathname,
    metadata: { ...metadata, ...getUtmParams(), referrer: localStorage.getItem('utm_referrer') || '' },
  }
  fetch(`${API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}
