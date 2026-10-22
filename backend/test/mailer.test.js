import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  sendOrderReceipt,
  sendOrderStatusEmail,
  sendSupportReplyEmail,
  maskEmail,
} from '../src/utils/mailer.js'

const sampleOrder = {
  orderId: '3f6b2a91-0f4c-4b8e-9c1d-2a7e5f0b1234',
  createdAt: '2026-10-16T04:05:06.000Z',
  items: [{ name: 'Royal Canin Adult Beef 10kg', quantity: 1, unitPrice: 2450, subtotal: 2450 }],
  discountTotal: 0,
  shippingFee: 75,
  total: 2525,
  paymentMethod: 'gcash',
  customerName: 'Ken',
  address: '123 Bayanan Ave, Marikina City',
}

describe('mailer: transport', () => {
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

  function captureFetch(result = { ok: true }) {
    const calls = []
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts })
      return result
    }
    return calls
  }

  test('receipt: posts sender, recipient, html and text to Brevo', async () => {
    const calls = captureFetch()
    const res = await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.deepEqual(res, { sent: true })
    assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(calls[0].opts.method, 'POST')
    assert.equal(calls[0].opts.headers['api-key'], 'test-key')
    const body = JSON.parse(calls[0].opts.body)
    assert.deepEqual(body.sender, { email: 'shop@gmail.com', name: 'Whiskers Pet Shop' })
    assert.deepEqual(body.to, [{ email: 'ken@example.com' }])
    assert.match(body.htmlContent, /Payment receipt/i)
    assert.match(body.textContent, /Total paid: PHP 2,525\.00/)
  })

  test('status update: carries the order and status into the payload', async () => {
    const calls = captureFetch()
    const res = await sendOrderStatusEmail('ken@example.com', {
      orderId: sampleOrder.orderId,
      status: 'Shipped',
      previousStatus: 'Processing',
      itemsCount: 2,
    })
    assert.deepEqual(res, { sent: true })
    const body = JSON.parse(calls[0].opts.body)
    assert.match(body.subject, /on its way/)
    assert.match(body.textContent, /Status updated: Processing - Shipped\./)
    assert.match(body.htmlContent, /2 items/)
  })

  test('support reply: carries name, question and answer into the payload', async () => {
    const calls = captureFetch()
    const res = await sendSupportReplyEmail('ken@example.com', {
      customerName: 'Ken',
      message: 'In stock?',
      reply: 'Yes, 12 left.',
    })
    assert.deepEqual(res, { sent: true })
    const body = JSON.parse(calls[0].opts.body)
    assert.match(body.textContent, /Yes, 12 left\./)
    assert.match(body.textContent, /In stock\?/)
  })

  test('no recipient is a skip for every send kind, never a crash', async () => {
    globalThis.fetch = async () => { throw new Error('must not be called') }
    assert.deepEqual(await sendOrderReceipt('', sampleOrder), { sent: false, reason: 'no_recipient' })
    assert.deepEqual(await sendOrderStatusEmail(null, { orderId: 'a', status: 'Shipped' }), { sent: false, reason: 'no_recipient' })
    assert.deepEqual(await sendSupportReplyEmail('not-an-email', { reply: 'hi' }), { sent: false, reason: 'no_recipient' })
  })

  test('missing config short-circuits without any network call', async () => {
    delete process.env.BREVO_API_KEY
    globalThis.fetch = async () => { throw new Error('fetch must not be called unconfigured') }
    assert.deepEqual(await sendOrderReceipt('ken@example.com', sampleOrder), { sent: false, reason: 'not_configured' })
    assert.deepEqual(await sendOrderStatusEmail('ken@example.com', { orderId: 'a', status: 'Shipped' }), { sent: false, reason: 'not_configured' })
    assert.deepEqual(await sendSupportReplyEmail('ken@example.com', { reply: 'hi' }), { sent: false, reason: 'not_configured' })
  })

  test('provider error is reported, never thrown', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'Key not found' })
    const res = await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.equal(res.sent, false)
    assert.equal(res.status, 401)
  })

  test('network failure is reported, never thrown', async () => {
    globalThis.fetch = async () => { throw new Error('ECONNRESET') }
    const res = await sendSupportReplyEmail('ken@example.com', { reply: 'hi' })
    assert.equal(res.sent, false)
    assert.equal(res.reason, 'network_error')
  })

  test('timeout is reported, never thrown', async () => {
    globalThis.fetch = async (_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    const res = await sendOrderStatusEmail('ken@example.com', { orderId: 'a', status: 'Shipped' })
    assert.equal(res.sent, false)
    assert.equal(res.reason, 'timeout')
  })

  test('the store name falls back when MAIL_FROM_NAME is unset', async () => {
    delete process.env.MAIL_FROM_NAME
    const calls = captureFetch()
    await sendOrderReceipt('ken@example.com', sampleOrder)
    assert.equal(JSON.parse(calls[0].opts.body).sender.name, 'Whiskers Pet Shop')
  })
})

describe('mailer: maskEmail (re-exported for logging)', () => {
  test('masks the local part', () => {
    assert.equal(maskEmail('ken@example.com'), 'k***@example.com')
  })
})
