// PayMongo Hosted Checkout integration.
//
// This module is the ONLY place that talks to PayMongo's HTTP API. It covers
// three things:
//   1. creating a Checkout Session (POST /v2/checkout_sessions),
//   2. verifying the Paymongo-Signature header on webhook deliveries,
//   3. the small amount/method helpers the order path needs.
//
// Design notes:
//   - Everything is inert until PAYMONGO_SECRET_KEY is set, so dev, CI and the
//     E2E suite keep using the simulated gateway untouched.
//   - Amounts are integer centavos (PHP is the only settlement currency).
//   - The secret key is never logged or returned to callers.
//   - Webhook verification must run on the RAW body (see routes/payments.js).
//
// Docs: https://docs.paymongo.com/docs/payment-channels-hosted-checkout
//       https://docs.paymongo.com/docs/developer-tools-webhook-setup-management

import crypto from 'crypto'
import logger from './logger.js'

const DEFAULT_API_BASE = 'https://api.paymongo.com'
const DEFAULT_SITE_URL = 'https://whiskerspet.me'

// Our storefront method id -> PayMongo payment_method_types. The customer
// already picked a method on our checkout, so the hosted page offers only it.
const METHOD_TYPES = {
  gcash: ['gcash'],
  paymaya: ['paymaya'],
}

export function payMongoSecret() {
  return String(process.env.PAYMONGO_SECRET_KEY || '').trim()
}

export function payMongoConfigured() {
  return Boolean(payMongoSecret())
}

export function payMongoLiveMode() {
  return payMongoSecret().startsWith('sk_live_')
}

export function payMongoWebhookSecret() {
  return String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim()
}

export function payMongoApiBase() {
  return String(process.env.PAYMONGO_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '')
}

// Public origin PayMongo sends the shopper back to. Explicit env wins so the
// links stay correct even behind a proxy that rewrites Host.
export function siteUrl() {
  const raw = String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || DEFAULT_SITE_URL).trim()
  return raw.replace(/\/+$/, '')
}

export function toCentavos(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function methodTypesFor(method) {
  return METHOD_TYPES[String(method || '').trim().toLowerCase()] || null
}

// One summary line item: the charged amount must equal our ledger total
// exactly (subtotal - promo + shipping), and itemization already lives in the
// receipt. Per-line items would need rounding gymnastics for discounts.
export function buildCheckoutPayload({ orderId, amount, method, successUrl, cancelUrl }) {
  const centavos = toCentavos(amount)
  const types = methodTypesFor(method)
  if (centavos === null || centavos < 1) throw new Error('Invalid checkout amount')
  if (!types) throw new Error('Unsupported online payment method')

  return {
    data: {
      attributes: {
        line_items: [
          {
            name: `Whiskers Pet Shop order #WPS-${String(orderId).slice(0, 6).toUpperCase()}`,
            description: 'Pet supplies. Amount already includes any discount and shipping fee.',
            amount: centavos,
            currency: 'PHP',
            quantity: 1,
          },
        ],
        payment_method_types: types,
        success_url: successUrl,
        cancel_url: cancelUrl,
        reference_number: String(orderId),
        // we send our own branded receipt on payment success
        send_email_receipt: false,
        metadata: { order_id: String(orderId) },
      },
    },
  }
}

/**
 * Create a Checkout Session and return { sessionId, checkoutUrl, livemode }.
 * Throws on configuration errors and on a non-2xx PayMongo response; the
 * message is safe to show to an operator (never contains the API key).
 */
export async function createCheckoutSession(
  { orderId, amount, method, successUrl, cancelUrl },
  { fetchImpl = fetch } = {}
) {
  const secret = payMongoSecret()
  if (!secret) throw new Error('PayMongo is not configured')

  const payload = buildCheckoutPayload({ orderId, amount, method, successUrl, cancelUrl })
  const res = await fetchImpl(`${payMongoApiBase()}/v2/checkout_sessions`, {
    method: 'POST',
    headers: {
      // PayMongo basic auth: secret key as username, empty password
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })

  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.code || `HTTP ${res.status}`
    logger.warn({ status: res.status, detail, orderId }, 'PayMongo checkout session failed')
    throw new Error(`Payment provider error: ${detail}`)
  }

  const attrs = json?.data?.attributes
  if (!attrs?.checkout_url) throw new Error('Payment provider returned no checkout URL')

  return {
    sessionId: json.data.id,
    checkoutUrl: attrs.checkout_url,
    livemode: Boolean(attrs.livemode),
  }
}

// "t=1496734173,te=<hex>,li=<hex>" (te = test mode, li = live mode)
export function parseSignatureHeader(header) {
  const parts = String(header || '')
    .split(',')
    .reduce((acc, chunk) => {
      const idx = chunk.indexOf('=')
      if (idx > 0) acc[chunk.slice(0, idx).trim()] = chunk.slice(idx + 1).trim()
      return acc
    }, {})
  return { timestamp: parts.t || '', test: parts.te || '', live: parts.li || '' }
}

/**
 * Verify a PayMongo webhook delivery.
 * Signature = HMAC-SHA256(secret, `${t}.${rawBody}`) as lowercase hex, compared
 * against te (test mode) or li (live mode). Timestamp skew is rejected to blunt
 * replay attacks; a failed check must discard the request unparsed.
 */
export function verifyWebhookSignature({
  header,
  rawBody,
  secret,
  livemode = false,
  toleranceSeconds = 300,
  now = Date.now(),
}) {
  if (!header || !secret) return false
  const { timestamp, test, live } = parseSignatureHeader(header)
  const provided = livemode ? live : test
  if (!timestamp || !provided) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Math.floor(now / 1000) - ts) > toleranceSeconds) return false

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
