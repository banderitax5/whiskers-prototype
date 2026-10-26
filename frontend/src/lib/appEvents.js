const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const COOKIE_KEY = 'whiskers_cookie_consent'
const SESSION_KEY = 'whiskers_analytics_session'
const SEARCH_KEY = 'whiskers_tracked_searches'
const LEGACY_UTM_KEYS = ['utm_data', 'utm_params', 'utm_referrer']

// analytics only fire when the user has accepted cookies (banner stores
// 'accepted' or 'declined'); no consent decision yet also blocks tracking
function hasAnalyticsConsent() {
  try { return localStorage.getItem(COOKIE_KEY) === 'accepted' }
  catch { return false }
}

function makeSessionId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* fall through */ }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function externalReferrer() {
  try {
    if (!document.referrer) return ''
    const url = new URL(document.referrer)
    const host = url.hostname.replace(/^www\./i, '').toLowerCase()
    const own = window.location.hostname.replace(/^www\./i, '').toLowerCase()
    if (!host || host === own) return ''
    // Keep the landing page but drop query/hash so campaign parameters are
    // not retained anywhere now that UTM tracking is removed.
    return `${url.origin}${url.pathname}`
  } catch {
    return ''
  }
}

function clearLegacyUtm() {
  try {
    for (const key of LEGACY_UTM_KEYS) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  } catch { /* storage can be unavailable */ }
}

// One anonymous id per browser tab/session. It lets the funnel and traffic
// panels count people instead of raw events without storing anything personal.
export function initAnalyticsSession() {
  clearLegacyUtm()
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.id === 'string' && parsed.id) return parsed
    }
    const session = { id: makeSessionId(), referrer: externalReferrer() }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  } catch {
    return { id: '', referrer: '' }
  }
}

export function trackEvent(eventType, metadata = {}) {
  if (!hasAnalyticsConsent()) return
  const session = initAnalyticsSession()
  const payload = {
    event_type: eventType,
    page: window.location.pathname,
    metadata: {
      ...metadata,
      session_id: session.id,
      referrer: session.referrer,
    },
  }
  fetch(`${API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

// Track a search term once per session. Intermediate keystrokes are filtered
// by the caller's debounce; this guards repeat searches and back/forward.
export function trackSearch(query) {
  if (!hasAnalyticsConsent()) return
  const q = String(query || '').trim().toLowerCase()
  if (q.length < 2) return
  try {
    const raw = JSON.parse(sessionStorage.getItem(SEARCH_KEY) || '[]')
    const seen = Array.isArray(raw) ? raw : []
    if (seen.includes(q)) return
    sessionStorage.setItem(SEARCH_KEY, JSON.stringify([...seen.slice(-19), q]))
  } catch { /* continue without dedupe */ }
  trackEvent('search', { query: q })
}
