// Browser side of Web Push: subscribe this device, unsubscribe it, and report
// whether it is already registered.
//
// The actual notification is shown by public/push-sw.js (imported into the
// generated service worker). This module only deals with permission and the
// subscription handshake.
//
// Everything returns a result object instead of throwing, because every caller
// is a button that must show a readable message rather than a stack trace.
import supabase from './supabase'
import { apiGet, apiPostAuth } from './api'

// The Push API hands keys over as base64url; the browser wants raw bytes.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  // iOS only allows web push for a site added to the home screen (16.4+).
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  if (isIos && !standalone) return 'needs_install'
  return 'ok'
}

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

// How long to wait for the generated worker to activate before giving up.
// `navigator.serviceWorker.ready` never settles when nothing is registered
// (the dev server), so without a cap every caller would hang there forever.
const REGISTRATION_TIMEOUT_MS = 5000

async function registration() {
  if (!('serviceWorker' in navigator)) return null
  // `ready` waits for the generated worker to activate, which is what makes
  // push work on the very first visit after install.
  let ready
  try {
    ready = navigator.serviceWorker.ready
  } catch {
    ready = null
  }
  if (!ready) return null

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), REGISTRATION_TIMEOUT_MS)
  })
  try {
    const reg = await Promise.race([ready, timeout])
    if (reg) return reg
  } catch {
    // fall through to the lookup below
  } finally {
    clearTimeout(timer)
  }
  try {
    return await navigator.serviceWorker.getRegistration()
  } catch {
    return null
  }
}

// Public VAPID key from the server. No session needed, so this also works on a
// cold visit before sign-in.
export async function pushConfig() {
  try {
    const data = await apiGet('/push/public-key')
    return { enabled: Boolean(data?.enabled && data?.publicKey), publicKey: data?.publicKey || null }
  } catch {
    return { enabled: false, publicKey: null }
  }
}

export async function currentSubscription() {
  const reg = await registration()
  if (!reg) return null
  try {
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

// One device's subscription just changed. The bell and the Profile row can be
// on screen next to the permission card, so they listen for this and re-read
// their On/Off state instead of showing "Off" right after the shopper allowed.
const PUSH_CHANGED_EVENT = "whiskers:push-changed"

export function onPushChange(handler) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(PUSH_CHANGED_EVENT, handler)
  return () => window.removeEventListener(PUSH_CHANGED_EVENT, handler)
}

function announcePushChange() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(PUSH_CHANGED_EVENT))
}

export async function isSubscribed() {
  const sub = await currentSubscription()
  return Boolean(sub)
}

// Ask for permission, subscribe, and tell the server. Returns
// { ok, reason } where reason is safe to show to the user.
export async function enablePush() {
  const support = pushSupport()
  if (support === 'unsupported') {
    return { ok: false, reason: 'This browser cannot show notifications. Try Chrome on a computer or Android.' }
  }
  if (support === 'needs_install') {
    return {
      ok: false,
      reason: 'On an iPhone, add this site to your Home Screen first, then open it from there and turn notifications on.',
    }
  }

  // Start the permission request in THIS tick, before any network await.
  // Browsers only show the prompt while the tap/click still counts as a user
  // gesture; an earlier `await` can spend it, and Chrome/Safari then resolve
  // 'default' without showing anything. This is the whole reason the bell
  // could look dead.
  let permissionPromise
  if (Notification.permission === 'granted') {
    permissionPromise = Promise.resolve('granted')
  } else if (Notification.permission === 'denied') {
    return {
      ok: false,
      reason: 'Notifications are blocked for this site. Turn them on in your browser site settings, then try again.',
    }
  } else {
    try {
      permissionPromise = Promise.resolve(Notification.requestPermission())
    } catch {
      permissionPromise = Promise.resolve('denied')
    }
  }

  const config = await pushConfig()
  if (!config.enabled) {
    return { ok: false, reason: 'Notifications are not set up on this server yet.' }
  }

  const permission = await permissionPromise
  if (permission !== 'granted') {
    return {
      ok: false,
      reason:
        permission === 'denied'
          ? 'Notifications are blocked for this site. Turn them on in your browser site settings, then try again.'
          : 'Notifications were not allowed. Tap Allow notifications and choose Allow when the browser asks.',
    }
  }

  const reg = await registration()
  if (!reg) return { ok: false, reason: 'This browser could not register the notification service. Reload and try again.' }

  let sub = await currentSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      })
    } catch {
      return { ok: false, reason: 'This device could not be registered. Reload and try again.' }
    }
  }

  const json = sub.toJSON()
  const authToken = await token()
  if (!authToken) return { ok: false, reason: 'Please sign in again, then turn notifications on.' }

  try {
    await apiPostAuth(
      '/push/subscribe',
      { endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent },
      authToken
    )
  } catch (err) {
    return { ok: false, reason: err?.message || 'We could not save this device. Please try again.' }
  }

  announcePushChange()
  return { ok: true }
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  try {
    const authToken = await token()
    if (authToken) await apiPostAuth('/push/unsubscribe', { endpoint }, authToken)
  } catch {
    // The server row is best-effort; unsubscribing locally is what stops the
    // alerts, so keep going either way.
  }
  try {
    await sub.unsubscribe()
  } catch {
    return { ok: false, reason: 'This device could not be unsubscribed. Try again.' }
  }
  announcePushChange()
  return { ok: true }
}

export async function sendTestPush() {
  const authToken = await token()
  if (!authToken) return { ok: false, reason: 'Please sign in again.' }
  try {
    await apiPostAuth('/push/test', {}, authToken)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err?.message || 'The test notification could not be sent.' }
  }
}
