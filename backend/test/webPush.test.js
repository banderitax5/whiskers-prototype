import { test } from 'node:test'
import assert from 'node:assert/strict'

// utils/webPush.js pulls in the service-role Supabase client, which refuses to
// construct without a URL. Tests never touch the network, so a placeholder is
// enough - set it before the dynamic import below runs.
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key'
process.env.SUPABASE_ANON_KEY ||= 'test-anon-key'

const { buildOrderPushPayload, isPushConfigured } = await import('../src/utils/webPush.js')

// The payload is what a staff member reads on a lock screen, so the wording
// and the plural handling are worth pinning.

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

test('isPushConfigured is false without VAPID keys', () => {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  delete process.env.VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  assert.equal(isPushConfigured(), false)
  if (pub) process.env.VAPID_PUBLIC_KEY = pub
  if (priv) process.env.VAPID_PRIVATE_KEY = priv
})
