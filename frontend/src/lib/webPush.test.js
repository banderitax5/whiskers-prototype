// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

// webPush.js imports the real Supabase client and the API wrapper; both need
// env vars and a network, so they are stubbed here.
vi.mock('./supabase', () => ({
  default: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 't' } } })) } },
}))
vi.mock('./api', () => ({
  apiGet: vi.fn(async () => ({ enabled: true, publicKey: 'BPublic' })),
  apiPostAuth: vi.fn(async () => ({ ok: true })),
}))

const { urlBase64ToUint8Array, pushSupport } = await import('./webPush')

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
