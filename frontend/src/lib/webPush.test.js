// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'

// webPush.js imports the real Supabase client and the API wrapper; both need
// env vars and a network, so they are stubbed here.
vi.mock('./supabase', () => ({
  default: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 't' } } })) } },
}))
vi.mock('./api', () => ({
  apiGet: vi.fn(async () => ({ enabled: true, publicKey: 'BPublic' })),
  apiPostAuth: vi.fn(async () => ({ ok: true })),
}))

const { urlBase64ToUint8Array, pushSupport, enablePush, onPushChange } = await import('./webPush')
const api = await import('./api')

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "hello" in base64url is aGVsbG8
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111])
  })

  it('translates - and _ to + and /', () => {
    // bytes 0xfb 0xff -> base64 "+/8=" -> base64url "-_8"
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('handles a real VAPID key length', () => {
    const key = 'BINHJv-i03hKVrXq6kPbcWJ8SArKhEFA7tEHUHIHHc-WyVBbqw3LDyDjRSs5Faw1PwVNcMbrrcHy17lo8VdgWEc'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
  })
})

describe('pushSupport', () => {
  function installBrowser({ userAgent = 'Mozilla/5.0 (X11; Linux x86_64)', standalone = false } = {}) {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
    window.PushManager = function PushManager() {}
    window.Notification = function Notification() {}
    window.matchMedia = () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} })
    return vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  }

  function removeBrowser() {
    delete navigator.serviceWorker
    delete window.PushManager
    delete window.Notification
  }

  it('reports unsupported when the browser has no PushManager', () => {
    removeBrowser()
    expect(pushSupport()).toBe('unsupported')
  })

  it('asks an iPhone in a normal tab to install the app first', () => {
    const ua = installBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })
    expect(pushSupport()).toBe('needs_install')
    ua.mockRestore()
    removeBrowser()
  })

  it('is ok on Android and desktop browsers', () => {
    const ua = installBrowser()
    expect(pushSupport()).toBe('ok')
    ua.mockRestore()
    removeBrowser()
  })
})

describe('enablePush', () => {
  // A browser that can push: worker already active, PushManager present, and
  // a notification permission the test controls.
  function installBrowser({ permission = 'default' } = {}) {
    const requestPermission = vi.fn(async () => permission)
    const subscription = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: vi.fn(async () => true),
    }
    const reg = {
      pushManager: {
        getSubscription: vi.fn(async () => null),
        subscribe: vi.fn(async () => subscription),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
    })
    window.PushManager = function PushManager() {}
    function FakeNotification() {}
    FakeNotification.permission = permission
    FakeNotification.requestPermission = requestPermission
    window.Notification = FakeNotification
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    return { requestPermission, reg, subscription }
  }

  function removeBrowser() {
    delete navigator.serviceWorker
    delete window.PushManager
    delete window.Notification
  }

  afterEach(() => {
    removeBrowser()
    vi.clearAllMocks()
  })

  it('asks the browser for permission before fetching the server config', async () => {
    const { requestPermission } = installBrowser()
    // The order of awaits is the point: the browser only shows its prompt while
    // the click still counts as a user gesture, so the request must be the
    // first thing that happens.
    const order = []
    requestPermission.mockImplementation(async () => {
      order.push('permission')
      return 'granted'
    })
    api.apiGet.mockImplementation(async () => {
      order.push('config')
      return { enabled: true, publicKey: 'BPublic' }
    })

    const result = await enablePush()
    expect(result.ok).toBe(true)
    expect(order).toEqual(['permission', 'config'])
    expect(api.apiPostAuth).toHaveBeenCalledWith(
      '/push/subscribe',
      expect.objectContaining({ endpoint: 'https://push.example/abc' }),
      't'
    )
  })

  it('does not ask the browser again when permission is already granted', async () => {
    const { requestPermission } = installBrowser({ permission: 'granted' })
    const result = await enablePush()
    expect(result.ok).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('reads a blocked permission as blocked instead of asking a dead prompt', async () => {
    installBrowser({ permission: 'denied' })
    const result = await enablePush()
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/blocked/i)
    expect(result.reason).toMatch(/site settings/i)
  })

  it('explains a dismissed prompt in plain words', async () => {
    installBrowser({ permission: 'default' })
    Notification.requestPermission.mockResolvedValueOnce('default')
    const result = await enablePush()
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not allowed/i)
  })

  it('tells the bell and Profile row when a device is turned on', async () => {
    installBrowser()
    Notification.requestPermission.mockResolvedValue('granted')
    const heard = vi.fn()
    const stop = onPushChange(heard)
    const result = await enablePush()
    expect(result.ok).toBe(true)
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    await enablePush()
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
