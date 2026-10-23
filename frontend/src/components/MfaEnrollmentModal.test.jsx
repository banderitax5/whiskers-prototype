// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MfaEnrollmentModal from './MfaEnrollmentModal.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const enrollment = {
  factorId: 'factor-1',
  secret: 'JBSWY3DPEHPK3PXP',
  qrCode: 'data:image/png;base64,abc',
  uri: 'otpauth://totp/Whiskers?secret=JBSWY3DPEHPK3PXP',
}

async function render(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onClose = vi.fn()
  const onVerify = vi.fn()
  await act(async () => {
    root.render(
      <MfaEnrollmentModal
        enrollment={enrollment}
        onClose={onClose}
        onVerify={onVerify}
        saving={false}
        {...props}
      />
    )
  })
  cleanup = () => act(() => root.unmount())
  return { c: container, onClose, onVerify }
}

async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('MfaEnrollmentModal', () => {
  it('shows the QR code and the manual secret', async () => {
    const { c } = await render()
    expect(c.querySelector('img[alt="QR code for authenticator app"]')).toBeTruthy()
    expect(c.textContent).toContain('JBSW Y3DP EHPK 3PXP')
    expect(c.querySelector('#mfa-enroll-code')).toBeTruthy()
  })

  it('keeps the verify button disabled until six digits are entered', async () => {
    const { c, onVerify } = await render()
    const submit = button(c, 'Verify and turn on')
    expect(submit.disabled).toBe(true)
    await type(c.querySelector('#mfa-enroll-code'), '123')
    expect(button(c, 'Verify and turn on').disabled).toBe(true)
    await act(async () => { submit.click() })
    expect(onVerify).not.toHaveBeenCalled()
  })

  it('verifies a complete code and normalizes pasted spaces', async () => {
    const { c, onVerify } = await render()
    await type(c.querySelector('#mfa-enroll-code'), '123 456')
    await act(async () => { button(c, 'Verify and turn on').click() })
    expect(onVerify).toHaveBeenCalledWith('123456')
  })

  it('closes on Escape and on a backdrop click, but not on a panel click', async () => {
    const { c, onClose } = await render()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalledTimes(1)

    const panel = c.querySelector('[role="dialog"]')
    await act(async () => { panel.click() })
    expect(onClose).toHaveBeenCalledTimes(1)

    await act(async () => { c.firstChild.click() })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
