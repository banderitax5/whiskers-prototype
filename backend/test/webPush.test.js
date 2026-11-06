import { test } from 'node:test'
import assert from 'node:assert/strict'

// utils/webPush.js pulls in the service-role Supabase client, which refuses to
// construct without a URL. Tests never touch the network, so a placeholder is
// enough - set it before the dynamic import below runs.
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key'
process.env.SUPABASE_ANON_KEY ||= 'test-anon-key'

const { buildOrderPushPayload, buildOrderStatusPushPayload, isPushConfigured } = await import(
  '../src/utils/webPush.js'
)

// The payload is what a person reads on a lock screen, so the wording and the
// plural handling are worth pinning.

test('order push names the customer, the item count and the total', () => {
  const payload = buildOrderPushPayload({
    customerName: 'Juan Dela Cruz',
    itemCount: 3,
    totalAmount: 1250,
    orderId: 'abc-123',
  })
  assert.equal(payload.title, 'New order received')
  assert.match(payload.body, /^Juan Dela Cruz ordered 3 items - PHP 1,250\.00$/)
  assert.equal(payload.url, '/admin/orders')
  assert.equal(payload.tag, 'order-abc-123')
})

test('order push uses the singular for one item', () => {
  const payload = buildOrderPushPayload({ customerName: 'Ana', itemCount: 1, totalAmount: 99.5 })
  assert.match(payload.body, /ordered 1 item - PHP 99\.50$/)
})

test('order push survives a missing customer name and total', () => {
  const payload = buildOrderPushPayload({ customerName: '   ', itemCount: 0, totalAmount: null })
  assert.match(payload.body, /^A customer ordered 0 items - PHP 0\.00$/)
})

test('status push tells the customer what changed and links to their orders', () => {
  const payload = buildOrderStatusPushPayload({
    orderId: 'abcdef12-3456-7890-abcd-ef1234567890',
    status: 'Shipped',
    itemsCount: 2,
  })
  assert.equal(payload.title, 'Order Shipped')
  assert.match(payload.body, /^Your order #ABCDEF12 is now shipped\. 2 items\. Tap to see it\.$/)
  assert.equal(payload.url, '/orders')
  assert.equal(payload.tag, 'order-status-abcdef12-3456-7890-abcd-ef1234567890')
})

test('status push uses the singular and copes with no items or status', () => {
  const one = buildOrderStatusPushPayload({ orderId: 'abcdef12', status: 'Delivered', itemsCount: 1 })
  assert.match(one.body, /1 item\. Tap/)
  const bare = buildOrderStatusPushPayload({ orderId: null, status: null, itemsCount: 0 })
  assert.equal(bare.title, 'Order Updated')
  assert.match(bare.body, /is now updated\./)
})

test('isPushConfigured is false without VAPID keys', () => {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  delete process.env.VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  assert.equal(isPushConfigured(), false)
  if (pub) process.env.VAPID_PUBLIC_KEY = pub
  if (priv) process.env.VAPID_PRIVATE_KEY = priv
})
