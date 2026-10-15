import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReceiptEmail,
  sendOrderReceipt,
  maskEmail,
  paymentMethodLabel,
} from '../src/utils/mailer.js'

const sampleOrder = {
  orderId: '3f6b2a91-0f4c-4b8e-9c1d-2a7e5f0b1234',
  createdAt: '2026-10-16T04:05:06.000Z', // 12:05 PM Manila
  items: [
    { name: 'Royal Canin Adult Beef 10kg', quantity: 1, unitPrice: 2450, subtotal: 2450 },
    { name: 'Pedigree Chewy Chunks 1.5kg', quantity: 2, unitPrice: 132.5, subtotal: 265 },
  ],
  discountTotal: 50,
  shippingFee: 75,
  total: 2740,
  paymentMethod: 'gcash',
  customerName: 'Ken',
  address: '123 Bayanan Ave, Marikina City',
}

describe('mailer: buildReceiptEmail', () => {
  test('subject carries the short order id', () => {
    const { subject } = buildReceiptEmail(sampleOrder)
    assert.match(subject, /#3F6B2A91/)
    assert.match(subject, /Whiskers Pet Shop/)
  })

  test('html lists items with quantities and line totals', () => {
    const { html } = buildReceiptEmail(sampleOrder)
    assert.match(html, /Royal Canin Adult Beef 10kg/)
    assert.match(html, /x1/)
    assert.match(html, /PHP 2,450\.00/)
    assert.match(html, /Pedigree Chewy Chunks 1\.5kg/)
    assert.match(html, /PHP 265\.00/)
  })

  test('discount, free shipping and paid shipping render distinctly', () => {
    const withDiscount = buildReceiptEmail(sampleOrder).html
    assert.match(withDiscount, /-PHP 50\.00/)
    assert.match(withDiscount, /PHP 75\.00/)

    const freeShip = buildReceiptEmail({
      ...sampleOrder,
      discountTotal: 0,
      shippingFee: 0,
    }).html
    assert.doesNotMatch(freeShip, /Discount/)
    assert.match(freeShip, />Free</)
  })

  test('total row names the payment method', () => {
    const { html } = buildReceiptEmail(sampleOrder)
    assert.match(html, /GCash/)
    const cod = buildReceiptEmail({ ...sampleOrder, paymentMethod: 'cod' }).html
    assert.match(cod, /COD \(Cash on Delivery\)/)
  })

  test('receipt dates use the shop timezone, not the server timezone', () => {
    const { html, text } = buildReceiptEmail(sampleOrder)
    // 04:05 UTC is 12:05 PM in Manila
    assert.match(html, /12:05/)
    assert.match(text, /12:05/)
  })

  test('text alternative carries every line a receipt needs', () => {
    const { text } = buildReceiptEmail(sampleOrder)
    assert.match(text, /Hi Ken,/)
    assert.match(text, /Order: #3F6B2A91/)
    assert.match(text, /Royal Canin Adult Beef 10kg x1 - PHP 2,450\.00/)
    assert.match(text, /Discount: -PHP 50\.00/)
    assert.match(text, /Shipping: PHP 75\.00/)
    assert.match(text, /Total paid: PHP 2,740\.00/)
    assert.match(text, /Payment method: GCash/)
    assert.match(text, /123 Bayanan Ave, Marikina City/)
  })

  test('greeting and address degrade gracefully when missing', () => {
    const { html, text } = buildReceiptEmail({
      ...sampleOrder,
      customerName: '',
      address: '',
      createdAt: null,
    })
    assert.match(text, /Hi there,/)
    assert.doesNotMatch(text, /Placed:/)
    assert.match(html, /N\/A/)
  })

  test('unknown payment ids fall through instead of blanking', () => {
    assert.equal(paymentMethodLabel('gcash'), 'GCash')
    assert.equal(paymentMethodLabel('instapay'), 'instapay')
    assert.equal(paymentMethodLabel(''), 'N/A')
  })
})

describe('mailer: sendOrderReceipt', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.BREVO_API_KEY = 'test-key'
    process.env.MAIL_FROM_EMAIL = 'shop@gmail.com'
    process.env.MAIL_FROM_NAME = 'Whiskers Pet Shop'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  test('no recipient is a skip, never a crash', async () => {
    const res = await sendOrderReceipt('', sampleOrder)
    assert.equal(res.sent, false)
    assert.equal(res.reason, 'no_recipient')
  })

  test('missing config short-circuits without any network call', async () => {
    delete process.env.BREVO_API_KEY
    globalThis.fetch = async () => { throw new Error('fetch must not be called unconfigured') }
    const res = await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.equal(res.sent, false)
    assert.equal(res.reason, 'not_configured')
  })

  test('success: posts sender, recipient, html and text to Brevo', async () => {
    let captured = null
    globalThis.fetch = async (url, opts) => {
      captured = { url, opts }
      return { ok: true }
    }
    const res = await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.deepEqual(res, { sent: true })
    assert.equal(captured.url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(captured.opts.method, 'POST')
    assert.equal(captured.opts.headers['api-key'], 'test-key')
    const body = JSON.parse(captured.opts.body)
    assert.deepEqual(body.sender, { email: 'shop@gmail.com', name: 'Whiskers Pet Shop' })
    assert.deepEqual(body.to, [{ email: 'ken@example.com' }])
    assert.match(body.htmlContent, /receipt|Payment receipt/i)
    assert.match(body.textContent, /Total paid: PHP 2,740\.00/)
  })

  test('provider error is reported, never thrown', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'Key not found' })
    const res = await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.equal(res.sent, false)
    assert.equal(res.status, 401)
  })

  test('network failure is reported, never thrown', async () => {
    globalThis.fetch = async () => { throw new Error('ECONNRESET') }
    const res = await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.equal(res.sent, false)
    assert.equal(res.reason, 'network_error')
  })

  test('the store name falls back when MAIL_FROM_NAME is unset', async () => {
    delete process.env.MAIL_FROM_NAME
    let body = null
    globalThis.fetch = async (_url, opts) => { body = JSON.parse(opts.body); return { ok: true } }
    await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.equal(body.sender.name, 'Whiskers Pet Shop')
  })
})

describe('mailer: maskEmail', () => {
  test('keeps only the first letter of each side', () => {
    assert.equal(maskEmail('ken@example.com'), 'k***@example.com')
    assert.equal(maskEmail('a@b.co'), 'a***@b.co')
  })
})
