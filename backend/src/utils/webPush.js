// Web Push for the back office.
//
// When a shopper places an order, every staff/admin device that opted in gets
// a real system notification: lock screen and notification shade on a phone,
// Action Center on Windows, Notification Center on macOS.
//
// Everything here is best-effort. A push that cannot be sent must never delay,
// fail or roll back the order that triggered it, so every function returns a
// result object instead of throwing, and the caller does not await it.
//
// Without VAPID keys configured (local dev, tests, CI) the module is inert:
// isPushConfigured() is false and no network call is made.
// web-push is CommonJS: `import webpush from 'web-push'` throws
// "does not provide an export named 'default'" under ESM. Namespace import
// works for both the CJS build and any future ESM one.
import * as webpushModule from 'web-push'
const webpush = webpushModule.default || webpushModule
import { supabaseAdmin } from '../config/supabase.js'
import logger from './logger.js'

const SUBJECT = process.env.PUSH_SUBJECT || 'mailto:shop@whiskerspet.me'

let configured = false
function configure() {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  try {
    webpush.setVapidDetails(SUBJECT, publicKey, privateKey)
    configured = true
    return true
  } catch (err) {
    logger.error({ err }, 'Web Push VAPID setup failed')
    return false
  }
}

export function isPushConfigured() {
  return configure()
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null
}

// "PHP 1,250.00" without pulling in a formatting helper.
function pesos(amount) {
  return `PHP ${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// The notification a staff member sees. Kept short: the lock screen truncates.
export function buildOrderPushPayload({ customerName, itemCount, totalAmount, orderId }) {
  const who = (customerName || 'A customer').trim() || 'A customer'
  const items = Number(itemCount) || 0
  return {
    title: 'New order received',
    body: `${who} ordered ${items} item${items === 1 ? '' : 's'} - ${pesos(totalAmount)}`,
    url: '/admin/orders',
    tag: `order-${orderId || 'new'}`,
  }
}

// Staff and admin accounts only. A shopper account never gets order alerts.
async function staffUserIds() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .in('role', ['staff', 'admin'])
  if (error) {
    logger.warn({ err: error }, 'Push: could not load staff accounts')
    return []
  }
  return (data || []).map((row) => row.id).filter(Boolean)
}

// Send to every subscribed staff/admin device. Returns a small summary so the
// route can tell the caller what happened; never throws.
export async function notifyStaffNewOrder(order) {
  if (!configure()) return { sent: 0, skipped: 'not_configured' }
  try {
    const userIds = await staffUserIds()
    if (!userIds.length) return { sent: 0, skipped: 'no_staff' }

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', userIds)
    // A pending migration looks exactly like "nobody subscribed yet" to the
    // shopper, so stay quiet about it here; the bell button reports it.
    if (error) return { sent: 0, skipped: 'no_table' }
    if (!subs?.length) return { sent: 0, skipped: 'no_subscribers' }

    const payload = JSON.stringify(buildOrderPushPayload(order))
    const gone = []
    let sent = 0

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60 }
          )
          sent += 1
        } catch (err) {
          // 404/410 means the browser dropped the subscription (uninstalled,
          // permission revoked, profile deleted). Forget it so the table does
          // not grow forever.
          if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.id)
          else logger.warn({ statusCode: err?.statusCode }, 'Push send failed')
        }
      })
    )

    if (gone.length) {
      await supabaseAdmin.from('push_subscriptions').delete().in('id', gone)
    }
    return { sent, gone: gone.length }
  } catch (err) {
    logger.warn({ err }, 'Push: notifyStaffNewOrder failed')
    return { sent: 0, skipped: 'error' }
  }
}

// Used by the "Send a test notification" button so a staff member can prove
// the phone is really receiving them.
export async function sendTestPush(userId) {
  if (!configure()) return { sent: 0, reason: 'not_configured' }
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) return { sent: 0, reason: 'no_table' }
  if (!subs?.length) return { sent: 0, reason: 'no_subscribers' }

  const payload = JSON.stringify({
    title: 'Notifications are on',
    body: 'You will get an alert here when a customer places an order.',
    url: '/admin/orders',
    tag: 'test',
  })

  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      sent += 1
    } catch (err) {
      logger.warn({ statusCode: err?.statusCode }, 'Push test send failed')
    }
  }
  return { sent }
}
