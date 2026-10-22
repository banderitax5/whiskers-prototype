import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  toCentavos,
  methodTypesFor,
  buildCheckoutPayload,
  createCheckoutSession,
  parseSignatureHeader,
  verifyWebhookSignature,
  payMongoConfigured,
  payMongoLiveMode,
  siteUrl,
} from '../src/utils/payMongo.js'

function withEnv(vars, fn) {
  const saved = {}
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

async function withEnvAsync(vars, fn) {
  const saved = {}
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

function sign(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

test('toCentavos rounds pesos to integer centavos and rejects junk', () => {
  assert.equal(toCentavos(265), 26500)
  assert.equal(toCentavos('265.50'), 26550)
  assert.equal(toCentavos(0.1 + 0.2), 30)
  assert.equal(toCentavos(19.995), 2000)
  assert.equal(toCentavos(''), 0)
  assert.equal(toCentavos(-1), null)
  assert.equal(toCentavos('abc'), null)
  assert.equal(toCentavos(null), 0)
})

test('methodTypesFor maps the storefront gateway methods only', () => {
  assert.deepEqual(methodTypesFor('gcash'), ['gcash'])
  assert.deepEqual(methodTypesFor('PayMaya'), ['paymaya'])
  assert.equal(methodTypesFor('cod'), null)
  assert.equal(methodTypesFor('card'), null)
})

test('buildCheckoutPayload charges the ledger total as one PHP line item', () => {
  const payload = buildCheckoutPayload({
    orderId: '6a5c2f7e-1111-2222-3333-444455556666',
    amount: 1234.5,
    method: 'gcash',
    successUrl: 'https://whiskerspet.me/orders/x?payment=paymongo',
    cancelUrl: 'https://whiskerspet.me/cart?payment=cancelled',
  })
  const a = payload.data.attributes
  assert.equal(a.line_items.length, 1)
  assert.equal(a.line_items[0].amount, 123450)
  assert.equal(a.line_items[0].currency, 'PHP')
  assert.equal(a.line_items[0].quantity, 1)
  assert.deepEqual(a.payment_method_types, ['gcash'])
  assert.equal(a.reference_number, '6a5c2f7e-1111-2222-3333-444455556666')
  assert.equal(a.metadata.order_id, '6a5c2f7e-1111-2222-3333-444455556666')
  assert.equal(a.send_email_receipt, false)
  assert.equal(a.success_url, 'https://whiskerspet.me/orders/x?payment=paymongo')
})

test('buildCheckoutPayload rejects unpriced amounts and unsupported methods', () => {
  const base = { orderId: 'abc', amount: 10, successUrl: 's', cancelUrl: 'c' }
  assert.throws(() => buildCheckoutPayload({ ...base, amount: 0 }), /Invalid checkout amount/)
  assert.throws(() => buildCheckoutPayload({ ...base, amount: -5 }), /Invalid checkout amount/)
  assert.throws(() => buildCheckoutPayload({ ...base, method: 'cod' }), /Unsupported online payment method/)
})

test('configured/live mode follow the secret key prefix', () => {
  withEnv({ PAYMONGO_SECRET_KEY: '' }, () => assert.equal(payMongoConfigured(), false))
  withEnv({ PAYMONGO_SECRET_KEY: '  ' }, () => assert.equal(payMongoConfigured(), false))
  withEnv({ PAYMONGO_SECRET_KEY: 'sk_test_abc' }, () => {
    assert.equal(payMongoConfigured(), true)
    assert.equal(payMongoLiveMode(), false)
  })
  withEnv({ PAYMONGO_SECRET_KEY: 'sk_live_abc' }, () => assert.equal(payMongoLiveMode(), true))
})

test('siteUrl trims trailing slashes and defaults to production', () => {
  withEnv({ PUBLIC_SITE_URL: undefined, SITE_URL: undefined }, () => {
    assert.equal(siteUrl(), 'https://whiskerspet.me')
  })
  withEnv({ PUBLIC_SITE_URL: 'https://example.com/', SITE_URL: undefined }, () => {
    assert.equal(siteUrl(), 'https://example.com')
  })
})

test('parseSignatureHeader reads t / te / li', () => {
  assert.deepEqual(parseSignatureHeader('t=1496734173,te=abc,li=def'), {
    timestamp: '1496734173',
    test: 'abc',
    live: 'def',
  })
  assert.deepEqual(parseSignatureHeader(''), { timestamp: '', test: '', live: '' })
  assert.deepEqual(parseSignatureHeader(null), { timestamp: '', test: '', live: '' })
})

test('verifyWebhookSignature accepts the documented HMAC vector', () => {
  // fixed vector: HMAC-SHA256("whsec_test_secret", "1700000000." + body)
  const body = '{"order_id":"abc"}'
  const secret = 'whsec_test_secret'
  const header = `t=1700000000,te=c1a7c87f4663dfbf2088330fdd2db898f16c63e1bada15d82817ebbe52931fce,li=deadbeef`
  const now = 1700000000 * 1000
  assert.equal(verifyWebhookSignature({ header, rawBody: body, secret, livemode: false, now }), true)
  assert.equal(verifyWebhookSignature({ header, rawBody: Buffer.from(body), secret, livemode: false, now }), true)
})

test('verifyWebhookSignature picks li in live mode and rejects a missing side', () => {
  const body = '{"a":1}'
  const secret = 'whsec_live'
  const ts = '1700000000'
  const live = sign(secret, ts, body)
  const test = sign(secret, ts, body)
  const header = `t=${ts},te=${test},li=${live}`
  const now = 1700000000 * 1000
  assert.equal(verifyWebhookSignature({ header, rawBody: body, secret, livemode: true, now }), true)
  assert.equal(verifyWebhookSignature({ header: `t=${ts},te=${test}`, rawBody: body, secret, livemode: true, now }), false)
  assert.equal(verifyWebhookSignature({ header: `t=${ts},li=${live}`, rawBody: body, secret, livemode: false, now }), false)
})

test('verifyWebhookSignature rejects tampering, wrong secret, stale timestamps and junk', () => {
  const body = '{"a":1}'
  const secret = 'whsec_test'
  const ts = '1700000000'
  const good = sign(secret, ts, body)
  const now = 1700000000 * 1000
  assert.equal(
    verifyWebhookSignature({ header: `t=${ts},te=${good}`, rawBody: '{"a":2}', secret, now }),
    false
  )
  assert.equal(
    verifyWebhookSignature({ header: `t=${ts},te=${good}`, rawBody: body, secret: 'other', now }),
    false
  )
  assert.equal(
    verifyWebhookSignature({ header: `t=${ts},te=${good}`, rawBody: body, secret, now: now + 301_000 }),
    false
  )
  assert.equal(verifyWebhookSignature({ header: '', rawBody: body, secret, now }), false)
  assert.equal(verifyWebhookSignature({ header: `t=${ts},te=${good}`, rawBody: body, secret: '', now }), false)
  assert.equal(
    verifyWebhookSignature({ header: `t=notanumber,te=${good}`, rawBody: body, secret, now }),
    false
  )
  // a truncated hex value must not throw from timingSafeEqual
  assert.equal(
    verifyWebhookSignature({ header: `t=${ts},te=${good.slice(0, 10)}`, rawBody: body, secret, now }),
    false
  )
})

test('createCheckoutSession posts with basic auth and returns the checkout url', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({
        data: {
          id: 'cs_test_123',
          attributes: { checkout_url: 'https://checkout.paymongo.com/cs_test_123', livemode: false },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  const session = await withEnvAsync({ PAYMONGO_SECRET_KEY: 'sk_test_key', PAYMONGO_API_BASE: 'https://api.example.test/' }, () =>
    createCheckoutSession(
      { orderId: 'order-1', amount: 99.5, method: 'paymaya', successUrl: 's', cancelUrl: 'c' },
      { fetchImpl: fakeFetch }
    )
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.example.test/v2/checkout_sessions')
  assert.equal(calls[0].init.method, 'POST')
  const auth = calls[0].init.headers.Authorization
  assert.equal(auth, `Basic ${Buffer.from('sk_test_key:').toString('base64')}`)
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.data.attributes.line_items[0].amount, 9950)
  assert.equal(session.sessionId, 'cs_test_123')
  assert.equal(session.checkoutUrl, 'https://checkout.paymongo.com/cs_test_123')
  assert.equal(session.livemode, false)
})

test('createCheckoutSession surfaces provider errors without the key', async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ errors: [{ detail: 'Invalid amount' }] }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })

  await withEnvAsync({ PAYMONGO_SECRET_KEY: 'sk_test_key', PAYMONGO_API_BASE: undefined }, async () => {
    await assert.rejects(
      createCheckoutSession(
        { orderId: 'order-1', amount: 10, method: 'gcash', successUrl: 's', cancelUrl: 'c' },
        { fetchImpl: fakeFetch }
      ),
      (err) => {
        assert.match(err.message, /Invalid amount/)
        assert.doesNotMatch(err.message, /sk_test_key/)
        return true
      }
    )
  })
})

test('createCheckoutSession refuses to run unconfigured', async () => {
  await withEnvAsync({ PAYMONGO_SECRET_KEY: undefined }, async () => {
    await assert.rejects(
      createCheckoutSession({ orderId: 'o', amount: 1, method: 'gcash', successUrl: 's', cancelUrl: 'c' }),
      /not configured/
    )
  })
})

test('createCheckoutSession rejects a response without checkout_url', async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ data: { id: 'cs_1', attributes: {} } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  await withEnvAsync({ PAYMONGO_SECRET_KEY: 'sk_test_key' }, async () => {
    await assert.rejects(
      createCheckoutSession(
        { orderId: 'o', amount: 1, method: 'gcash', successUrl: 's', cancelUrl: 'c' },
        { fetchImpl: fakeFetch }
      ),
      /no checkout URL/
    )
  })
})
