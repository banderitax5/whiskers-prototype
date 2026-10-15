// Transactional email through Brevo's HTTP API (v1: order receipts).
//
// Design constraints this module lives by:
//   1. Email is best-effort. A provider outage, a bad key, or a timeout must
//      never fail an order, a checkout, or any other business action. Nothing
//      here throws - every failure is swallowed and logged.
//   2. Zero new runtime dependencies: Brevo speaks plain HTTP, so one fetch()
//      replaces an SDK.
//   3. Without BREVO_API_KEY + MAIL_FROM_EMAIL (dev, CI, E2E) calls are
//      skipped without touching the network - no key means no side effects.
//   4. PII hygiene: the recipient address is never logged in full; only a
//      masked form (a***@d***.com) plus the order id appear in logs.
//
// Supabase (GoTrue) keeps sending the auth emails - password reset included -
// out of the box; this module is for business mail the shop owns.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 5000

// checkout sends payment method ids; the receipt shows the human label.
// Unknown / self-managed ids fall through as-is
export const PAYMENT_METHOD_LABELS = {
  gcash: 'GCash',
  paymaya: 'PayMaya',
  cod: 'COD (Cash on Delivery)',
}

const STORE_NAME = 'Whiskers Pet Shop'

// hours the shop is open - shown in the receipt footer (paper: 9am-9pm)
const STORE_HOURS = 'Open daily 9:00 AM - 9:00 PM'

function php(amount) {
  const n = Number(amount)
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'
}

export function paymentMethodLabel(id) {
  const key = String(id || '').toLowerCase()
  return PAYMENT_METHOD_LABELS[key] || id || 'N/A'
}

// a***@d***.com - enough to correlate logs, not enough to leak an address
export function maskEmail(email) {
  const [name = '', domain = ''] = String(email || '').split('@')
  return `${name.slice(0, 1)}***@${domain}`
}

function isMailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL)
}

function shortId(orderId) {
  return String(orderId || '').slice(0, 8).toUpperCase()
}

// the dates in a receipt are Manila wall-clock time (the shop's timezone),
// not the server's - Oracle Cloud VMs default to UTC
function formatDate(iso) {
  // a falsy timestamp is "unknown", and new Date(null) is the 1970 epoch
  // rather than an invalid date - both must render as no date at all
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Build the receipt content for one order. Pure - takes a plain object, so it
// can be unit tested and reused for other channels later.
// order = {
//   orderId, createdAt,
//   items:   [{ name, quantity, unitPrice, subtotal }],
//   discountTotal, shippingFee, total,
//   paymentMethod, customerName, address
// }
export function buildReceiptEmail(order) {
  const {
    orderId,
    createdAt,
    items = [],
    discountTotal = 0,
    shippingFee = 0,
    total = 0,
    paymentMethod,
    customerName,
    address,
  } = order || {}

  const safeItems = items.filter((i) => i && i.name)
  const greeting = customerName ? `Hi ${customerName},` : 'Hi there,'
  const when = formatDate(createdAt)

  const subject = `Your ${STORE_NAME} order #${shortId(orderId)}`

  // ---- plain text alternative (spam filters and text-only clients) --------
  const textLines = [
    greeting,
    '',
    `Thank you for shopping at ${STORE_NAME}! We received your order and will start preparing it right away.`,
    '',
    `Order: #${shortId(orderId)}`,
    when ? `Placed: ${when}` : null,
    '',
    ...safeItems.map(
      (i) => `- ${i.name} x${i.quantity} - PHP ${php(i.subtotal)}`
    ),
    '',
  ].filter((l) => l !== null)
  if (Number(discountTotal) > 0) textLines.push(`Discount: -PHP ${php(discountTotal)}`)
  textLines.push(
    `Shipping: ${Number(shippingFee) > 0 ? `PHP ${php(shippingFee)}` : 'Free'}`,
    `Total paid: PHP ${php(total)}`,
    `Payment method: ${paymentMethodLabel(paymentMethod)}`,
    '',
    'Delivery address:',
    address || 'N/A',
    '',
    `Questions about your order? Reply to this email or call us at our shop during business hours (${STORE_HOURS}).`,
    '',
    `${STORE_NAME} - Thank you!`
  )

  const row = (label, value, strong = false) =>
    `<tr><td style="padding:4px 0;color:#5b6472;font-size:14px;">${label}</td>` +
    `<td style="padding:4px 0;text-align:right;font-size:14px;${strong ? 'font-weight:700;' : ''}">${value}</td></tr>`

  const itemRows = safeItems
    .map(
      (i) =>
        `<tr>` +
        `<td style="padding:6px 0;border-bottom:1px solid #eceff3;font-size:14px;color:#1c2430;">${i.name}<br>` +
        `<span style="color:#8a94a3;font-size:12px;">x${i.quantity}</span></td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #eceff3;text-align:right;font-size:14px;color:#1c2430;vertical-align:top;">PHP ${php(i.subtotal)}</td>` +
        `</tr>`
    )
    .join('')

  const html = `
<div style="background:#f4f6f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e8ee;">
    <div style="background:#0b2e59;padding:20px 28px;">
      <div style="color:#ffffff;font-size:18px;font-weight:700;">${STORE_NAME}</div>
      <div style="color:#bcd0ea;font-size:12px;margin-top:2px;">Payment receipt</div>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 4px;font-size:14px;color:#1c2430;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#5b6472;">Thank you for shopping with us! We received your order and will start preparing it right away.</p>
      <p style="margin:0 0 4px;font-size:13px;color:#1c2430;"><strong>Order #${shortId(orderId)}</strong></p>
      ${when ? `<p style="margin:0 0 16px;font-size:13px;color:#8a94a3;">Placed ${when}</p>` : '<div style="margin-bottom:16px;"></div>'}
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        ${itemRows || '<tr><td style="font-size:14px;color:#8a94a3;">No items</td></tr>'}
      </table>
      <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #eceff3;padding-top:8px;">
        ${Number(discountTotal) > 0 ? row('Discount', `-PHP ${php(discountTotal)}`) : ''}
        ${row('Shipping', Number(shippingFee) > 0 ? `PHP ${php(shippingFee)}` : 'Free')}
        ${row(`Total paid <span style="color:#8a94a3;font-size:12px;">(${paymentMethodLabel(paymentMethod)})</span>`, `PHP ${php(total)}`, true)}
      </table>
      <p style="margin:20px 0 4px;font-size:13px;color:#1c2430;"><strong>Delivery address</strong></p>
      <p style="margin:0;font-size:14px;color:#5b6472;white-space:pre-line;">${address || 'N/A'}</p>
      <p style="margin:20px 0 0;font-size:12px;color:#8a94a3;">Questions about your order? Reply to this email or contact us during business hours (${STORE_HOURS}).</p>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #eceff3;">
      <p style="margin:0;font-size:11px;color:#8a94a3;">${STORE_NAME} &middot; Concepcion, Marikina City &middot; This receipt was sent for an order placed on our website.</p>
    </div>
  </div>
</div>`.trim()

  return { subject, html, text: textLines.join('\n') }
}

// Send one order receipt. Never throws; the return value reports what
// happened so callers (and tests) can tell delivered from skipped.
export async function sendOrderReceipt(to, order) {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return { sent: false, reason: 'no_recipient' }
  }
  if (!isMailConfigured()) {
    return { sent: false, reason: 'not_configured' }
  }
  const { subject, html, text } = buildReceiptEmail(order)
  const payload = {
    sender: {
      email: process.env.MAIL_FROM_EMAIL,
      name: process.env.MAIL_FROM_NAME || STORE_NAME,
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
    return { sent: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network_error', detail: String(err?.message || err).slice(0, 200) }
  }
}
