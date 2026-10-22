// Transactional email transport through Brevo's HTTP API.
//
// Design constraints this module lives by:
//   1. Email is best-effort. A provider outage, a bad key, or a timeout must
//      never fail an order, a status change, or any other business action.
//      Nothing here throws - every failure is swallowed and reported as data.
//   2. Zero new runtime dependencies: Brevo speaks plain HTTP, so one fetch()
//      replaces an SDK.
//   3. Without BREVO_API_KEY + MAIL_FROM_EMAIL (dev, CI, E2E) calls are
//      skipped without touching the network - no key means no side effects.
//      MAIL_DISABLED=1 is the explicit kill-switch for test/E2E runs: an
//      empty BREVO_API_KEY pre-set is unreliable on Windows (PowerShell
//      drops empty env vars, so dotenv re-loads the real key from .env).
//   4. PII hygiene: recipient addresses are never logged in full; only a
//      masked form (a***@d***.com) plus the business id appears in logs.
//
// Supabase (GoTrue) keeps sending the auth emails - password reset included -
// out of the box (pending the owner's custom-SMTP decision); this module is
// for business mail the shop owns: receipts, order updates, support replies.

import {
  buildReceiptEmail,
  buildOrderStatusEmail,
  buildSupportReplyEmail,
  maskEmail,
} from './emailTemplates.js'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 5000

function isMailConfigured() {
  // explicit off-switch for E2E/probes (wins over a key present in .env)
  if (process.env.MAIL_DISABLED === '1') return false
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL)
}

// The one place a request actually leaves the process. Never throws.
async function sendMail({ to, subject, html, text }) {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return { sent: false, reason: 'no_recipient' }
  }
  if (!isMailConfigured()) {
    return { sent: false, reason: 'not_configured' }
  }
  const payload = {
    sender: {
      email: process.env.MAIL_FROM_EMAIL,
      name: process.env.MAIL_FROM_NAME || 'Whiskers Pet Shop',
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res
    try {
      res = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { sent: false, status: res.status, reason: `brevo_${res.status}`, detail: body.slice(0, 200) }
    }
    return { sent: true }
  } catch (err) {
    return {
      sent: false,
      reason: err?.name === 'AbortError' ? 'timeout' : 'network_error',
      detail: String(err?.message || err).slice(0, 200),
    }
  }
}

// ── the three business mails ────────────────────────────────────────────────

// order confirmation payment receipt (POST /api/orders)
export async function sendOrderReceipt(to, order) {
  const { subject, html, text } = buildReceiptEmail(order)
  return sendMail({ to, subject, html, text })
}

// lifecycle update for an existing order (PATCH /api/admin/orders/:id).
// `previousStatus` lets the copy tell shoppers what actually changed.
export async function sendOrderStatusEmail(to, { orderId, status, previousStatus, itemsCount, items }) {
  const { subject, html, text } = buildOrderStatusEmail({ orderId, status, previousStatus, itemsCount, items })
  return sendMail({ to, subject, html, text })
}

// staff answer to a support case (PATCH /api/admin/supports/:id)
export async function sendSupportReplyEmail(to, { customerName, message, reply }) {
  const { subject, html, text } = buildSupportReplyEmail({ customerName, message, reply })
  return sendMail({ to, subject, html, text })
}

export { maskEmail }
