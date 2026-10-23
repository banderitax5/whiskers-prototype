// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      getSession: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

import MfaVerifyGate from './MfaVerifyGate.jsx'
import supabase from '../lib/supabase'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

beforeEach(() => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'aal1-token' } } })
  supabase.auth.setSession.mockResolvedValue({ error: null })
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  delete globalThis.fetch
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onVerified = vi.fn()
  await act(async () => { root.render(<MfaVerifyGate onVerified={onVerified} />) })
  cleanup = () => act(() => root.unmount())
  return { c: container, onVerified }
}

async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

function okResponse(session) {
  return { ok: true, json: async () => ({ session }) }
}

describe('MfaVerifyGate', () => {
  it('rejects an incomplete code without calling the API', async () => {
    const { c } = await render()
    await type(c.querySelector('#gate-mfa-code'), '123')
    await act(async () => { button(c, 'Verify code').click() })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(c.textContent).toMatch(/exactly 6 digits/i)
  })

  it('verifies the code, installs the aal2 session, and opens the panel', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ access_token: 'aal2-token', refresh_token: 'refresh' }))
    const { c, onVerified } = await render()
    await type(c.querySelector('#gate-mfa-code'), '123 456')
    await act(async () => { button(c, 'Verify code').click() })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toMatch(/\/auth\/mfa\/verify$/)
    expect(opts.headers.Authorization).toBe('Bearer aal1-token')
    expect(JSON.parse(opts.body).code).toBe('123456')
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'aal2-token', refresh_token: 'refresh' })
    expect(onVerified).toHaveBeenCalledTimes(1)
  })

  it('shows the server message and stays closed when verification fails', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid code' }) })
    const { c, onVerified } = await render()
    await type(c.querySelector('#gate-mfa-code'), '123456')
    await act(async () => { button(c, 'Verify code').click() })

    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/Invalid code/)
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
    expect(onVerified).not.toHaveBeenCalled()
  })
})

