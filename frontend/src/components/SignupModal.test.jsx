// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: { auth: { setSession: vi.fn(async () => ({ error: null })) } },
}))
vi.mock('../lib/appEvents.js', () => ({ trackEvent: vi.fn() }))

import SignupModal from './SignupModal.jsx'
import supabase from '../lib/supabase'
import { trackEvent } from '../lib/appEvents.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}
const originalFetch = globalThis.fetch

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  globalThis.fetch = originalFetch
  vi.clearAllMocks()
})

function setInput(container, selector, value) {
  const input = container.querySelector(selector)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<SignupModal isOpen onClose={() => {}} onSwitchToLogin={() => {}} onSignupSuccess={() => {}} />)
  })
  cleanup = () => act(() => root.unmount())
  return container
}

async function fillAndSubmit(container) {
  await act(async () => {
    setInput(container, '#signup-firstName', 'Juana')
    setInput(container, '#signup-lastName', 'Dela Cruz')
    setInput(container, '#signup-email', 'juana@example.com')
    setInput(container, '#signup-password', 'Secret123!')
    setInput(container, '#signup-confirmPassword', 'Secret123!')
  })
  await act(async () => {
    container
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('SignupModal email-confirmation flow', () => {
  it('shows "check your inbox" when Supabase requires confirmation', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ requiresConfirmation: true, email: 'juana@example.com' }),
    }))
    const container = await render()
    await fillAndSubmit(container)

    expect(container.textContent).toMatch(/Confirm your email/i)
    expect(container.textContent).toMatch(/juana@example\.com/)
    expect(container.querySelector('form')).toBeNull()
    // no session was issued, so the app must not try to sign the user in
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('signup')
  })

  it('still signs the user in when Supabase returns a session', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ session: { access_token: 'a', refresh_token: 'r' } }),
    }))
    const onSignupSuccess = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <SignupModal isOpen onClose={() => {}} onSwitchToLogin={() => {}} onSignupSuccess={onSignupSuccess} />
      )
    })
    cleanup = () => act(() => root.unmount())

    await fillAndSubmit(container)

    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
    expect(onSignupSuccess).toHaveBeenCalled()
  })

  it('explains the password policy instead of a vague error', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    const container = await render()
    await act(async () => {
      setInput(container, '#signup-firstName', 'Derek')
      setInput(container, '#signup-lastName', 'Hale')
      setInput(container, '#signup-email', 'haled6159@example.com')
      setInput(container, '#signup-password', 'asdfasdf')
      setInput(container, '#signup-confirmPassword', 'asdfasdf')
    })
    await act(async () => {
      container
        .querySelector('form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(fetchMock).not.toHaveBeenCalled()
    const items = [...container.querySelectorAll('#signup-password-rules li')]
    const itemFor = (re) => items.find((li) => re.test(li.textContent))
    expect(itemFor(/lowercase/).className).toContain('text-green-700')
    expect(itemFor(/uppercase/).className).toContain('text-gray-500')
    expect(itemFor(/number/).className).toContain('text-gray-500')
    expect(itemFor(/symbol/).className).toContain('text-gray-500')
    expect(container.querySelector('#signup-password').getAttribute('aria-invalid')).toBe('true')
  })
})
