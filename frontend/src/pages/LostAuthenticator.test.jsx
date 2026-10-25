// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}))

vi.mock('../lib/siteContent.js', () => ({
  fetchSiteContent: vi.fn().mockResolvedValue(null),
  contentSettings: (content) => ({ ...(content?.settings || {}) }),
  CLIENT_DEFAULT_SETTINGS: {
    contact_phone: '+63 900 000 0000',
    contact_email: '',
  },
}))

import LostAuthenticator from './LostAuthenticator.jsx'

let cleanup = () => {}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('LostAuthenticator page', () => {
  it('is readable without a session and offers the contact actions', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<LostAuthenticator />) })
    await act(async () => { await Promise.resolve() })
    cleanup = () => act(() => root.unmount())

    expect(container.textContent).toMatch(/Lost access to your authenticator app\?/)
    expect(container.textContent).toMatch(/Have this ready/)
    expect(container.textContent).toMatch(/What happens next/)
    expect(container.textContent).toMatch(/Still signed in on a laptop/)
    expect([...container.querySelectorAll('a')].some((a) => a.textContent === 'Call the shop')).toBe(true)
    expect([...container.querySelectorAll('a')].some((a) => a.textContent === 'Email the shop')).toBe(true)
  })
})
