// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  get justVerifiedEmail() {
    return globalThis.__justVerified === true
  },
}))

import AuthNotice from './AuthNotice.jsx'
import { notifyAuth } from '../lib/authNotice.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  globalThis.__justVerified = false
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<AuthNotice />) })
  cleanup = () => act(() => root.unmount())
  return container
}

describe('AuthNotice', () => {
  it('greets the shopper after the email-confirmation redirect', async () => {
    globalThis.__justVerified = true
    const container = await render()
    expect(container.textContent).toMatch(/Email verified/)
    expect(container.textContent).toMatch(/account is confirmed/i)
    expect(container.querySelector('[role="status"]')).toBeTruthy()
  })

  it('renders nothing on a normal visit', async () => {
    const container = await render()
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('shows the password-changed notice when triggered', async () => {
    const container = await render()
    await act(async () => {
      notifyAuth({ title: 'Password changed', body: 'Your password was updated.' })
    })
    expect(container.textContent).toMatch(/Password changed/)
    expect(container.textContent).toMatch(/password was updated/i)
  })

  it('can be dismissed', async () => {
    globalThis.__justVerified = true
    const container = await render()
    const close = container.querySelector('[aria-label="Dismiss notification"]')
    expect(close).toBeTruthy()
    await act(async () => { close.click() })
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
