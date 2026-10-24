// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const RECOVERY_KEY = 'whiskers.recovery-pending'

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
      getSession: vi.fn(),
      setSession: vi.fn(),
      updateUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
  hadRecoveryMarker: false,
  RECOVERY_PENDING_KEY: 'whiskers.recovery-pending',
}))

import ResetPassword from './ResetPassword.jsx'
import supabase, { RECOVERY_PENDING_KEY } from '../lib/supabase'

let cleanup = () => {}

beforeEach(() => {
  localStorage.setItem(RECOVERY_PENDING_KEY, '1')
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  })
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'aal1-token' } } })
  supabase.auth.setSession.mockResolvedValue({ error: null })
  supabase.auth.updateUser.mockResolvedValue({ error: null })
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  localStorage.clear()
  vi.clearAllMocks()
  delete globalThis.fetch
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<ResetPassword />) })
  // let the assurance probe settle
  await act(async () => { await Promise.resolve() })
  cleanup = () => act(() => root.unmount())
  return container
}

async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('ResetPassword MFA step-up', () => {
  it('asks for the authenticator code when the account has MFA', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
    })
    const c = await render()
    expect(c.textContent).toMatch(/Verify it's you/i)
    expect(c.querySelector('#reset-mfa-code')).toBeTruthy()
    expect(c.querySelector('#reset-password')).toBeNull()
  })

  it('confirms the code, installs the aal2 session, then shows the password form', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
    })
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { access_token: 'aal2-token', refresh_token: 'refresh' } }),
    })
    const c = await render()
    await type(c.querySelector('#reset-mfa-code'), '123 456')
    await act(async () => { button(c, 'Verify code').click() })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/\/auth\/mfa\/verify$/)
    expect(opts.headers.Authorization).toBe('Bearer aal1-token')
    expect(JSON.parse(opts.body).code).toBe('123456')
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'aal2-token', refresh_token: 'refresh' })
    expect(c.querySelector('#reset-password')).toBeTruthy()
  })

  it('updates the password without a code when MFA is not enabled', async () => {
    const c = await render()
    expect(c.querySelector('#reset-password')).toBeTruthy()
    await type(c.querySelector('#reset-password'), 'NewPassword1!')
    await type(c.querySelector('#reset-confirm'), 'NewPassword1!')
    await act(async () => { button(c, 'Update password').click() })
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'NewPassword1!' })
  })

  it('falls back to the code step when Supabase rejects an aal1 password change', async () => {
    supabase.auth.updateUser.mockResolvedValue({
      error: { message: 'AAL2 session is required to update email or password when MFA is enabled.' },
    })
    const c = await render()
    await type(c.querySelector('#reset-password'), 'NewPassword1!')
    await type(c.querySelector('#reset-confirm'), 'NewPassword1!')
    await act(async () => { button(c, 'Update password').click() })

    expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1)
    expect(c.querySelector('#reset-mfa-code')).toBeTruthy()
    expect(c.textContent).toMatch(/authenticator app/i)
  })
})
