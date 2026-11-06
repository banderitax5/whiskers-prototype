// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// The component reads the signed-in account from the shop context and the push
// helpers from webPush; both are replaced so the card can be exercised without
// a backend, a real browser worker or a server key.
const state = vi.hoisted(() => ({ session: null }))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => ({ session: state.session }),
}))

const push = vi.hoisted(() => ({
  pushConfig: vi.fn(async () => ({ enabled: true, publicKey: 'BPublic' })),
  pushSupport: vi.fn(() => 'ok'),
  enablePush: vi.fn(async () => ({ ok: true })),
  sendTestPush: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../lib/webPush', () => push)

import NotificationPermissionPrompt from './NotificationPermissionPrompt.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let host

function setPermission(value) {
  function FakeNotification() {}
  FakeNotification.permission = value
  window.Notification = FakeNotification
}

async function mount(variant) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<NotificationPermissionPrompt variant={variant} />) })
}

async function elapse(ms = 3000) {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

function dialog() {
  return document.querySelector('[role="dialog"]')
}

function button(label) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent === label)
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  state.session = { access_token: 't' }
  setPermission('default')
  push.pushConfig.mockResolvedValue({ enabled: true, publicKey: 'BPublic' })
  push.pushSupport.mockReturnValue('ok')
  push.enablePush.mockResolvedValue({ ok: true })
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('NotificationPermissionPrompt', () => {
  it('asks a signed-in shopper once the permission is still unanswered', async () => {
    await mount()
    await elapse()
    const card = dialog()
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Get alerts about your orders')
    expect(card.textContent).toContain('browser will ask you to Allow')
  })

  it('uses the staff wording in the admin shell', async () => {
    await mount('staff')
    await elapse()
    expect(dialog().textContent).toContain('Get alerted to new orders')
    expect(dialog().textContent).toContain('customer places an order')
  })

  it('stays out of the way for guests', async () => {
    state.session = null
    await mount()
    await elapse()
    expect(dialog()).toBeNull()
  })

  it('does not ask when the browser already answered', async () => {
    setPermission('granted')
    await mount()
    await elapse()
    expect(dialog()).toBeNull()

    setPermission('denied')
    await act(async () => root.unmount())
    host.remove()
    await mount()
    await elapse()
    expect(dialog()).toBeNull()
  })

  it('does not ask an iPhone that still needs Add to Home Screen', async () => {
    push.pushSupport.mockReturnValue('needs_install')
    await mount()
    await elapse()
    expect(dialog()).toBeNull()
  })

  it('does not ask when the server has no push keys', async () => {
    push.pushConfig.mockResolvedValue({ enabled: false, publicKey: null })
    await mount()
    await elapse()
    expect(dialog()).toBeNull()
  })

  it('does not ask again after "Not now"', async () => {
    await mount()
    await elapse()
    act(() => button('Not now').click())
    expect(dialog()).toBeNull()
    expect(localStorage.getItem('whiskers_push_prompt_dismissed_at')).not.toBeNull()

    await act(async () => root.unmount())
    host.remove()
    await mount()
    await elapse()
    expect(dialog()).toBeNull()
  })

  it('turns notifications on from the Allow button and closes the card', async () => {
    await mount()
    await elapse()
    await act(async () => { button('Allow notifications').click() })
    expect(push.enablePush).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
    expect(localStorage.getItem('whiskers_push_prompt_dismissed_at')).not.toBeNull()
  })

  it('remembers a failed Allow so the card does not reappear', async () => {
    push.enablePush.mockResolvedValueOnce({ ok: false, reason: 'Notifications are blocked for this site.' })
    await mount()
    await elapse()
    await act(async () => { button('Allow notifications').click() })
    expect(dialog()).toBeNull()
    expect(localStorage.getItem('whiskers_push_prompt_dismissed_at')).not.toBeNull()

    await act(async () => root.unmount())
    host.remove()
    await mount()
    await elapse()
    expect(dialog()).toBeNull()
  })
})
