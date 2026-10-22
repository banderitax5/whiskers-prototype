import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientKey } from '../src/middleware/rateLimiter.js'

function req({ userId, ip = '198.51.100.7', headers = {} } = {}) {
  return { userId, ip, headers }
}

test('clientKey keys signed-in requests by user, not by shared IP', () => {
  const a = clientKey(req({ userId: 'user-a', ip: '203.0.113.10' }))
  const b = clientKey(req({ userId: 'user-b', ip: '203.0.113.10' }))
  assert.equal(a, 'user:user-a')
  assert.equal(b, 'user:user-b')
  assert.notEqual(a, b)
})

test('clientKey falls back to the request IP when unauthenticated', () => {
  assert.equal(clientKey(req()), '198.51.100.7')
})

test('clientKey ignores cf-connecting-ip unless TRUST_PROXY is set', () => {
  const previous = process.env.TRUST_PROXY
  delete process.env.TRUST_PROXY
  try {
    const r = req({ headers: { 'cf-connecting-ip': '203.0.113.99' } })
    assert.equal(clientKey(r), '198.51.100.7')
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = previous
  }
})

test('clientKey trusts cf-connecting-ip behind an opted-in proxy', () => {
  const previous = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  try {
    const r = req({ headers: { 'cf-connecting-ip': '203.0.113.99' } })
    assert.equal(clientKey(r), '203.0.113.99')
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = previous
  }
})

test('clientKey prefers the verified user over a spoofable proxy header', () => {
  const previous = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  try {
    const r = req({
      userId: 'user-c',
      headers: { 'cf-connecting-ip': '203.0.113.99' },
    })
    assert.equal(clientKey(r), 'user:user-c')
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = previous
  }
})
