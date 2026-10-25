// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/siteContent.js', () => ({
  fetchSiteContent: vi.fn(),
  contentSettings: (content) => ({ ...(content?.settings || {}) }),
  CLIENT_DEFAULT_SETTINGS: {
    contact_phone: '+63 900 000 0000',
    contact_email: '',
  },
}))

import {
  LostAuthenticatorHelp,
} from './LostAuthenticatorHelp.jsx'
import { contactLinks, SUPPORT_EMAIL_FALLBACK } from '../lib/mfaRecovery.js'
import { fetchSiteContent } from '../lib/siteContent.js'

let cleanup = () => {}

beforeEach(() => {
  fetchSiteContent.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  await act(async () => { await Promise.resolve() })
  cleanup = () => act(() => root.unmount())
  return container
}

function toggle(container) {
  return [...container.querySelectorAll('button')]
    .find((b) => /lost access to your authenticator app/i.test(b.textContent))
}

function anchor(container, text) {
  return [...container.querySelectorAll('a')].find((a) => a.textContent === text)
}

describe('contactLinks', () => {
  it('builds a dialable tel: href and strips formatting', () => {
    const { telHref } = contactLinks({ phone: '+63 912 345 6789', email: 'a@b.c' })
    expect(telHref).toBe('tel:+639123456789')
  })

  it('builds a mailto with a prefilled subject and the account email', () => {
    const { mailtoHref } = contactLinks({ phone: '+63 912 345 6789', email: 'shop@example.com', accountEmail: 'juan@example.com' })
    expect(mailtoHref).toMatch(/^mailto:shop@example\.com\?subject=Two-factor%20recovery%20request&body=/)
    expect(decodeURIComponent(mailtoHref)).toMatch(/Account email: juan@example\.com/)
  })
})

describe('LostAuthenticatorHelp', () => {
  it('stays collapsed without fetching site content', async () => {
    const c = await render(<LostAuthenticatorHelp email="juan@example.com" />)
    const btn = toggle(c)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(fetchSiteContent).not.toHaveBeenCalled()
  })

  it('opens the recovery steps and uses the shop contact details', async () => {
    fetchSiteContent.mockResolvedValue({
      settings: { contact_phone: '+63 917 111 2222', contact_email: 'help@whiskerspet.me' },
    })
    const c = await render(<LostAuthenticatorHelp email="juan@example.com" />)
    const btn = toggle(c)
    await act(async () => { btn.click() })
    await act(async () => { await Promise.resolve() })

    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(fetchSiteContent).toHaveBeenCalledTimes(1)
    expect(c.textContent).toMatch(/Have this ready/)
    expect(c.textContent).toMatch(/juan@example\.com/)
    expect(anchor(c, 'Call the shop').getAttribute('href')).toBe('tel:+639171112222')
    expect(anchor(c, 'Email the shop').getAttribute('href')).toContain('mailto:help@whiskerspet.me?')
    expect(anchor(c, 'Open this help in a new tab').getAttribute('href')).toBe('/help/lost-authenticator')
  })

  it('falls back to the shop support address when settings have no email', async () => {
    const c = await render(<LostAuthenticatorHelp />)
    await act(async () => { toggle(c).click() })
    await act(async () => { await Promise.resolve() })
    expect(anchor(c, 'Email the shop').getAttribute('href')).toContain(`mailto:${SUPPORT_EMAIL_FALLBACK}?`)
  })
})
