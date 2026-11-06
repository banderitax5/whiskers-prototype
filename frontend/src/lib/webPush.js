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

async function registration() {
  if (!('serviceWorker' in navigator)) return null
  // `ready` waits for the generated worker to activate, which is what makes
  // push work on the very first visit after install.
  return navigator.serviceWorker.ready
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

  const config = await pushConfig()
  if (!config.enabled) {
    return { ok: false, reason: 'Notifications are not set up on this server yet.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' }
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
