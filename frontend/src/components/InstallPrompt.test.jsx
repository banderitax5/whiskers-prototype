// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import InstallPrompt from './InstallPrompt.jsx'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

let root
let host

function setUA(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function mountPrompt() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<InstallPrompt />))
}

// the card shows 4 seconds after the cookie banner has been answered
async function passCookieAndDelay() {
  localStorage.setItem('whiskers_cookie_consent', 'accepted')
  await act(async () => {
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(4000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setUA(DESKTOP_CHROME)
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }))
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.useRealTimers()
})

describe('InstallPrompt', () => {
  it('stays hidden while the cookie banner is still unanswered', () => {
    setUA(IPHONE_SAFARI)
    mountPrompt()
    act(() => vi.advanceTimersByTime(10000))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the iPhone hint after cookies are answered', async () => {
    setUA(IPHONE_SAFARI)
    mountPrompt()
    await passCookieAndDelay()
    const card = document.querySelector('[role="dialog"]')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Add to Home Screen')
    expect(card.textContent).toContain('Open this page in Safari')
    expect(card.textContent).not.toContain('Install')
  })

  it('shows Mac Safari the File > Add to Dock hint, not an address bar icon', async () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')
    mountPrompt()
    await passCookieAndDelay()
    const card = document.querySelector('[role="dialog"]')
    expect(card.textContent).toContain('Add to Dock')
    expect(card.textContent).not.toContain('address bar')
  })

  it('shows desktop Chrome-style browsers (incl. Brave) a generic browser-menu hint', async () => {
    mountPrompt()
    await passCookieAndDelay()
    const card = document.querySelector('[role="dialog"]')
    expect(card).not.toBeNull()
    expect(card.textContent).not.toContain('address bar')
    expect(card.textContent).toContain('browser menu')
    const buttons = [...card.querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons).not.toContain('Install')
  })

  it('stays hidden in the installed app', async () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true }))
    mountPrompt()
    await passCookieAndDelay()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('does not show again after "Not now"', async () => {
    setUA(IPHONE_SAFARI)
    mountPrompt()
    await passCookieAndDelay()
    const notNow = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Not now')
    act(() => notNow.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(localStorage.getItem('whiskers_install_dismissed_at')).not.toBeNull()
  })

  it('tells the shopper that Not now hides the card for at least 30 days', async () => {
    setUA(IPHONE_SAFARI)
    mountPrompt()
    await passCookieAndDelay()
    const card = document.querySelector('[role="dialog"]')
    expect(card.textContent).toContain('at least 30 days')
  })

  it('stays hidden during the 30 days after a dismissal', async () => {
    localStorage.setItem('whiskers_install_dismissed_at', String(Date.now()))
    setUA(IPHONE_SAFARI)
    mountPrompt()
    await passCookieAndDelay()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the install button when the browser offers one', async () => {
    mountPrompt()
    await passCookieAndDelay()
    await act(async () => {
      const evt = new Event('beforeinstallprompt')
      evt.prompt = vi.fn()
      evt.userChoice = Promise.resolve({ outcome: 'dismissed' })
      evt.preventDefault = vi.fn()
      window.dispatchEvent(evt)
    })
    const card = document.querySelector('[role="dialog"]')
    expect(card).not.toBeNull()
    const install = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Install')
    expect(install).toBeTruthy()
  })
})
