// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// Both auth dialogs live in the navbar for the whole session, so React keeps
// their state across open/close. Nothing disappears on its own: whatever the
// previous person typed stays in the inputs and is shown to the next one. On a
// shared or demo machine that leaks the email AND the password.
vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      signInWithPassword: vi.fn(),
      setSession: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(),
      mfa: { verify: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn() },
    },
  },
}))
vi.mock('../lib/appEvents.js', () => ({ trackEvent: vi.fn() }))

import LoginModal from './LoginModal.jsx'
import SignupModal from './SignupModal.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

function setInput(container, selector, value) {
  const input = container.querySelector(selector)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function mount(Component, props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const view = (next) => act(async () => { root.render(<Component {...props} {...next} />) })
  await view({})
  cleanup = () => act(() => root.unmount())
  return { container, view }
}

const valueOf = (container, selector) => container.querySelector(selector)?.value

describe('auth dialogs do not keep credentials after closing', () => {
  it('LoginModal forgets the email and password', async () => {
    const { container, view } = await mount(LoginModal, {
      isOpen: true,
      onClose: () => {},
      onSwitchToSignup: () => {},
      onLoginSuccess: () => {},
    })

    await act(async () => {
      setInput(container, '#login-email', 'someone@example.com')
      setInput(container, '#login-password', 'Secret123!')
    })
    expect(valueOf(container, '#login-email')).toBe('someone@example.com')
    expect(valueOf(container, '#login-password')).toBe('Secret123!')

    // closing the dialog (backdrop click, Escape, or a successful sign-in)
    await view({ isOpen: false })
    // ...and opening it again for the next person
    await view({ isOpen: true })

    expect(valueOf(container, '#login-email')).toBe('')
    expect(valueOf(container, '#login-password')).toBe('')
    expect(container.querySelector('#login-password').getAttribute('type')).toBe('password')
  })

  it('SignupModal forgets every field it collected', async () => {
    const { container, view } = await mount(SignupModal, {
      isOpen: true,
      onClose: () => {},
      onSwitchToLogin: () => {},
      onSignupSuccess: () => {},
    })

    await act(async () => {
      setInput(container, '#signup-firstName', 'Juana')
      setInput(container, '#signup-lastName', 'Dela Cruz')
      setInput(container, '#signup-email', 'juana@example.com')
      setInput(container, '#signup-password', 'Secret123!')
      setInput(container, '#signup-confirmPassword', 'Secret123!')
    })
    expect(valueOf(container, '#signup-email')).toBe('juana@example.com')

    await view({ isOpen: false })
    await view({ isOpen: true })

    for (const id of ['firstName', 'lastName', 'email', 'password', 'confirmPassword']) {
      expect(valueOf(container, `#signup-${id}`)).toBe('')
    }
  })
})
