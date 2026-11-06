// Web Push subscription endpoints for the back office.
//
// The browser asks for the public VAPID key, subscribes with the push service,
// and hands the resulting endpoint + keys back here. The server stores them so
// it can notify that device later, even when the site is closed.
//
// Only a signed-in account may subscribe, and a subscription only ever receives
// that account's own alerts: staff/admin devices get "a customer placed an
// order", shoppers get "your order shipped". The two never cross.
import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { isSchemaPendingError } from '../utils/pgErrors.js'
import { MIGRATION_REQUIRED } from '../utils/messages.js'
import { isPushConfigured, sendTestPush, vapidPublicKey } from '../utils/webPush.js'
import logger from '../utils/logger.js'

const router = Router()

function sendSchemaPending(res) {
  return res.status(503).json({ error: MIGRATION_REQUIRED, code: 'MIGRATION_REQUIRED' })
}

// GET /api/push/public-key - the VAPID key the browser subscribes with.
// Public on purpose: it is a public key, and the browser needs it before it
// has any session to send. Returns enabled:false when the server is not
// configured, so the UI can hide the button instead of failing.
router.get('/public-key', (_req, res) => {
  const publicKey = vapidPublicKey()
  res.set('Cache-Control', 'public, max-age=300')
  res.json({ enabled: Boolean(publicKey && isPushConfigured()), publicKey: publicKey || null })
})

router.use(authMiddleware)

const MAX_ENDPOINT = 1000
const MAX_KEY = 200

function cleanString(value, max) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > max) return null
  return text
}

// POST /api/push/subscribe - remember this device for the signed-in account.
router.post('/subscribe', async (req, res) => {
  const endpoint = cleanString(req.body?.endpoint, MAX_ENDPOINT)
  const p256dh = cleanString(req.body?.keys?.p256dh, MAX_KEY)
  const auth = cleanString(req.body?.keys?.auth, MAX_KEY)

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'That device could not be registered. Try again in this browser.' })
  }
  if (!/^https:\/\//i.test(endpoint)) {
    return res.status(400).json({ error: 'That device could not be registered. Try again in this browser.' })
  }

  const userAgent = cleanString(req.get('user-agent'), 300)

  // Upsert on the endpoint: re-subscribing the same browser must not create a
  // second row (the browser can rotate its keys at any time).
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      { user_id: req.userId, endpoint, p256dh, auth, user_agent: userAgent },
      { onConflict: 'endpoint' }
    )

  if (error) {
    if (isSchemaPendingError(error)) return sendSchemaPending(res)
    logger.error({ err: error }, 'Push subscribe failed')
    return res.status(500).json({ error: 'We could not save this device. Please try again.' })
  }

  return res.status(201).json({ ok: true })
})

// POST /api/push/unsubscribe - forget this device.
router.post('/unsubscribe', async (req, res) => {
  const endpoint = cleanString(req.body?.endpoint, MAX_ENDPOINT)
  if (!endpoint) return res.status(400).json({ error: 'That device could not be found.' })

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', req.userId)

  if (error && isSchemaPendingError(error)) return sendSchemaPending(res)
  if (error) {
    logger.error({ err: error }, 'Push unsubscribe failed')
    return res.status(500).json({ error: 'We could not update this device. Please try again.' })
  }
  return res.json({ ok: true })
})

// GET /api/push/status - is this device already registered?
router.get('/status', async (req, res) => {
  const endpoint = cleanString(req.query?.endpoint, MAX_ENDPOINT)
  if (!endpoint) return res.json({ subscribed: false })

  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .eq('user_id', req.userId)
    .maybeSingle()

  if (error) {
    if (isSchemaPendingError(error)) return sendSchemaPending(res)
    return res.json({ subscribed: false })
  }
  return res.json({ subscribed: Boolean(data) })
})

// POST /api/push/test - prove it works, straight to this account's devices.
router.post('/test', async (req, res) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ error: 'Notifications are not set up on this server yet.', code: 'PUSH_NOT_CONFIGURED' })
  }
  const result = await sendTestPush(req.userId)
  if (result.reason === 'no_table') return sendSchemaPending(res)
  if (!result.sent) {
    return res.status(409).json({
      error: 'No device is receiving notifications yet. Turn them on in this browser first.',
    })
  }
  return res.json({ ok: true, sent: result.sent })
})

export default router
