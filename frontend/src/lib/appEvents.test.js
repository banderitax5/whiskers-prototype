// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { initAnalyticsSession, trackEvent, trackSearch } from './appEvents'

const originalFetch = globalThis.fetch
const originalReferrer = Object.getOwnPropertyDescriptor(document, 'referrer')

function setReferrer(value) {
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    get: () => value,
  })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('whiskers_cookie_consent', 'accepted')
  setReferrer('')
  globalThis.fetch = vi.fn(async () => ({ ok: true }))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalReferrer) Object.defineProperty(document, 'referrer', originalReferrer)
  else delete document.referrer
  vi.restoreAllMocks()
})

describe('appEvents analytics session', () => {
  test('creates one session id and strips campaign params from the referrer', () => {
    setReferrer('https://www.google.com/search?q=dog+food&utm_source=newsletter')

    const first = initAnalyticsSession()
    const second = initAnalyticsSession()

    expect(first.id).toBeTruthy()
    expect(second.id).toBe(first.id)
    expect(first.referrer).toBe('https://www.google.com/search')
  })

  test('treats our own pages as direct traffic', () => {
    setReferrer(`${window.location.origin}/menu?utm_source=internal`)

    expect(initAnalyticsSession().referrer).toBe('')
  })

  test('clears legacy UTM storage', () => {
    localStorage.setItem('utm_data', '{}')
    sessionStorage.setItem('utm_params', '{}')
    localStorage.setItem('utm_referrer', 'https://example.com/?utm_source=x')

    initAnalyticsSession()

    expect(localStorage.getItem('utm_data')).toBeNull()
    expect(sessionStorage.getItem('utm_params')).toBeNull()
    expect(localStorage.getItem('utm_referrer')).toBeNull()
  })

  test('does not send events without analytics consent', () => {
    localStorage.setItem('whiskers_cookie_consent', 'declined')

    trackEvent('page_view')

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('records a search once and includes the anonymous session id', () => {
    trackSearch('Dog Food')
    trackSearch('dog food')

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = globalThis.fetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(url).toBe('/api/events')
    expect(body.event_type).toBe('search')
    expect(body.page).toBe(window.location.pathname)
    expect(body.metadata.query).toBe('dog food')
    expect(body.metadata.session_id).toBeTruthy()
    expect(body.metadata.referrer).toBe('')
    expect(Object.keys(body.metadata).some((key) => key.startsWith('utm_'))).toBe(false)
  })
})
