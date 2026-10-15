// Email content builders - pure functions, no network, no side effects.
// Everything a receipt, status update, or support reply looks like lives
// here so wording can be reviewed and tested without a mail provider.
//
// House rules for every template:
//   - an html body plus a plain-text alternative (spam filters, text clients)
//   - inline styles only, table-based layout: email clients are not browsers
//   - Manila wall-clock dates (the server runs UTC; the shop is PH)
//   - no tracking pixels, no external fonts, no remote images besides the
//     shop's own assets - a plain receipt should look plain everywhere

// checkout sends payment method ids; the receipt shows the human label.
// Unknown / self-managed ids fall through as-is
const PAYMENT_METHOD_LABELS = {
  gcash: 'GCash',
  paymaya: 'PayMaya',
  cod: 'COD (Cash on Delivery)',
}

export function paymentMethodLabel(id) {
  const key = String(id || '').toLowerCase()
  return PAYMENT_METHOD_LABELS[key] || id || 'N/A'
}

const STORE_NAME = 'Whiskers Pet Shop'
const STORE_HOURS = 'Open daily 9:00 AM - 9:00 PM'

function php(amount) {
  const n = Number(amount)
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'
}

export function maskEmail(email) {
  const [name = '', domain = ''] = String(email || '').split('@')
  return `${name.slice(0, 1)}***@${domain}`
}

function shortId(orderId) {
  return String(orderId || '').slice(0, 8).toUpperCase()
}

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

// shared chrome: header, footer, and the paragraph wrapper every body uses
function shell(title, bodyHtml) {
  return `
<div style="background:#f4f6f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e8ee;">
    <div style="background:#0b2e59;padding:20px 28px;">
      <div style="color:#ffffff;font-size:18px;font-weight:700;">${STORE_NAME}</div>
      <div style="color:#bcd0ea;font-size:12px;margin-top:2px;">${title}</div>
    </div>
    <div style="padding:24px 28px;">${bodyHtml}</div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #eceff3;">
      <p style="margin:0;font-size:11px;color:#8a94a3;">${STORE_NAME} &middot; Concepcion, Marikina City &middot; Business hours: ${STORE_HOURS}</p>
    </div>
  </div>
</div>`.trim()
}

// ── order receipt (sent by POST /api/orders) ────────────────────────────────

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

  const textLines = [
    greeting,
    '',
    `Thank you for shopping at ${STORE_NAME}! We received your order and will start preparing it right away.`,
    '',
    `Order: #${shortId(orderId)}`,
    when ? `Placed: ${when}` : null,
    '',
    ...safeItems.map((i) => `- ${i.name} x${i.quantity} - PHP ${php(i.subtotal)}`),
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
    `Questions about your order? Reply to this email or contact us during business hours (${STORE_HOURS}).`,
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

  const html = shell(
    'Payment receipt',
    `
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
    `
  )

  return { subject, html, text: textLines.join('\n') }
}

// ── order status update (sent by PATCH /api/admin/orders/:id) ───────────────

// one paragraph per status: what the shopper is being told changed, in the
// shop's voice. Missing statuses get a neutral line rather than silence.
const STATUS_COPY = {
  Pending: {
    heading: 'We received your order',
    body: 'Your order is confirmed and queued. We will update you again once it moves forward.',
  },
  Processing: {
    heading: 'Payment received - preparing your order',
    body: 'We have received your payment and your order is now being prepared. You will hear from us as soon as it ships.',
  },
  Shipped: {
    heading: 'Your order is on its way',
    body: 'Good news - your order has left our shop and is on its way to you. Please keep an eye out for the delivery.',
  },
  Delivered: {
    heading: 'Your order has been delivered',
    body: 'Your order has been delivered. We hope your pet enjoys it! If anything is wrong, just reply to this email.',
  },
  Cancelled: {
    heading: 'Your order was cancelled',
    body: 'Your order has been cancelled. If you did not expect this or have any questions, please reply to this email and we will help you right away.',
  },
}

export function buildOrderStatusEmail({ orderId, status, previousStatus, itemsCount }) {
  const copy = STATUS_COPY[status] || {
    heading: `Your order is now ${status}`,
    body: 'Your order status has been updated. Sign in to your account to view the details.',
  }
  const count = Number(itemsCount) || 0
  const itemsLine = count === 1 ? '1 item' : `${count} items`

  const subject = `${copy.heading} - ${STORE_NAME} order #${shortId(orderId)}`
  const transition = previousStatus && previousStatus !== status
    ? `Status updated: ${previousStatus} - ${status}.`
    : `Current status: ${status}.`

  const text = [
    'Hi there,',
    '',
    copy.body,
    '',
    `Order: #${shortId(orderId)}`,
    `${transition} (${itemsLine})`,
    '',
    `Sign in to your ${STORE_NAME} account any time to track this order and see your receipt.`,
    '',
    `${STORE_NAME} - thank you for shopping with us!`,
  ].join('\n')

  const html = shell(
    'Order update',
    `
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1c2430;">${copy.heading}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#5b6472;">${copy.body}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #eceff3;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:10px 14px;font-size:13px;color:#5b6472;">Order</td>
            <td style="padding:10px 14px;font-size:13px;color:#1c2430;text-align:right;font-weight:700;">#${shortId(orderId)}</td></tr>
        <tr><td style="padding:0 14px 10px;font-size:13px;color:#5b6472;">Status</td>
            <td style="padding:0 14px 10px;font-size:13px;color:#1c2430;text-align:right;font-weight:700;">${status}</td></tr>
        <tr><td style="padding:0 14px 10px;font-size:13px;color:#5b6472;">Items</td>
            <td style="padding:0 14px 10px;font-size:13px;color:#1c2430;text-align:right;">${itemsLine}</td></tr>
      </table>
      <p style="margin:0;font-size:12px;color:#8a94a3;">Sign in to your ${STORE_NAME} account any time to track this order and view your receipt.</p>
    `
  )

  return { subject, html, text }
}

// ── support reply (sent by PATCH /api/admin/supports/:id) ───────────────────

export function buildSupportReplyEmail({ customerName, message, reply }) {
  const greeting = customerName ? `Hi ${customerName},` : 'Hi there,'
  const subject = `${STORE_NAME} replied to your support message`
  const quoted = message ? String(message) : ''
  const answer = String(reply || '')

  const text = [
    greeting,
    '',
    'Our team has replied to the message you sent us. Here is their answer:',
    '',
    answer,
    '',
    'Your original message:',
    quoted ? `> ${quoted.split('\n').join('\n> ')}` : '(no message text)',
    '',
    `Need anything else? Just reply to this email or send us a new message - we are happy to help. (${STORE_HOURS})`,
    '',
    `${STORE_NAME} Support`,
  ].join('\n')

  const html = shell(
    'Support reply',
    `
      <p style="margin:0 0 4px;font-size:14px;color:#1c2430;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#5b6472;">Our team has replied to the message you sent us. Here is their answer:</p>
      <div style="background:#f8fafc;border:1px solid #eceff3;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
        <p style="margin:0;font-size:14px;color:#1c2430;white-space:pre-line;">${answer}</p>
      </div>
      <p style="margin:0 0 4px;font-size:12px;color:#8a94a3;">Your original message:</p>
      <p style="margin:0 0 16px;font-size:13px;color:#5b6472;white-space:pre-line;">${quoted || '(no message text)'}</p>
      <p style="margin:0;font-size:12px;color:#8a94a3;">Need anything else? Reply to this email or send us a new message - we are happy to help (${STORE_HOURS}).</p>
    `
  )

  return { subject, html, text }
}
