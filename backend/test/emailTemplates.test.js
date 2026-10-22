import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReceiptEmail,
  buildOrderStatusEmail,
  buildSupportReplyEmail,
  paymentMethodLabel,
  maskEmail,
} from '../src/utils/emailTemplates.js'

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

describe('emailTemplates: receipt', () => {
  test('subject carries the short order id', () => {
    const { subject } = buildReceiptEmail(sampleOrder)
    assert.match(subject, /#WPS-3F6B2A91/)
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
    assert.match(text, /Order: #WPS-3F6B2A91/)
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

describe('emailTemplates: order status update', () => {
  test('every supported status has its own shopper copy', () => {
    for (const status of ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']) {
      const { subject, html, text } = buildOrderStatusEmail({ orderId: sampleOrder.orderId, status })
      assert.doesNotMatch(subject.toLowerCase(), /undefined/)
      assert.doesNotMatch(html, /undefined/)
      assert.match(html, new RegExp(status))
      assert.ok(subject.length > 10 && text.length > 40)
    }
  })

  test('processing (payment received) copy says payment was received', () => {
    const { subject, html } = buildOrderStatusEmail({
      orderId: sampleOrder.orderId,
      status: 'Processing',
    })
    assert.match(subject, /[Pp]ayment received/)
    assert.match(html, /payment/i)
  })

  test('subject names the transition when a previous status is given', () => {
    const { text } = buildOrderStatusEmail({
      orderId: sampleOrder.orderId,
      status: 'Shipped',
      previousStatus: 'Processing',
    })
    assert.match(text, /Status updated: Processing - Shipped\./)
  })

  test('item count is pluralised and survives bad input', () => {
    const one = buildOrderStatusEmail({ orderId: 'abc', status: 'Shipped', itemsCount: 1 }).text
    assert.match(one, /1 item\b/)
    const many = buildOrderStatusEmail({ orderId: 'abc', status: 'Shipped', itemsCount: 3 }).text
    assert.match(many, /3 items\b/)
    const bogus = buildOrderStatusEmail({ orderId: 'abc', status: 'Shipped', itemsCount: 'x' }).text
    assert.match(bogus, /0 items\b/)
  })

  test('an unknown status still produces a usable, honest email', () => {
    const { subject, html } = buildOrderStatusEmail({ orderId: 'abc', status: 'Backordered' })
    assert.match(subject, /now Backordered/)
    assert.match(html, /Backordered/)
  })
})

describe('emailTemplates: support reply', () => {
  test('subject, greeting and the staff answer all appear', () => {
    const { subject, html, text } = buildSupportReplyEmail({
      customerName: 'Ken',
      message: 'Is the Royal Canin 10kg in stock?',
      reply: 'Yes, we have 12 left. Order before 5pm for same-day delivery.',
    })
    assert.match(subject, /replied to your support message/)
    assert.match(text, /Hi Ken,/)
    assert.match(text, /Yes, we have 12 left/)
    assert.match(text, /Is the Royal Canin 10kg in stock\?/)
    assert.match(html, /Yes, we have 12 left/)
    assert.match(html, /Is the Royal Canin 10kg in stock\?/)
  })

  test('missing name/message degrade without breaking the layout', () => {
    const { html, text } = buildSupportReplyEmail({ reply: 'All set!' })
    assert.match(text, /Hi there,/)
    assert.match(text, /\(no message text\)/)
    assert.doesNotMatch(html, /undefined/)
    assert.doesNotMatch(text, /undefined/)
  })

  test('an empty reply still renders (staff can send an apology email)', () => {
    const { html, text } = buildSupportReplyEmail({ customerName: 'Ken', message: 'help', reply: '' })
    assert.match(html, /Support reply/i)
    assert.match(text, /Hi Ken,/)
  })
})

describe('emailTemplates: maskEmail', () => {
  test('keeps only the first letter of each side', () => {
    assert.equal(maskEmail('ken@example.com'), 'k***@example.com')
    assert.equal(maskEmail('a@b.co'), 'a***@b.co')
  })
})
