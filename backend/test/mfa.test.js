import test from 'node:test'
import assert from 'node:assert/strict'

const { hasVerifiedFactor, verifiedFactors, aalFromToken } = await import('../src/utils/mfa.js')

function tokenWith(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

test('verifiedFactors returns only verified factors', () => {
  const user = {
    factors: [
      { id: 'a', status: 'verified', factor_type: 'totp' },
      { id: 'b', status: 'unverified', factor_type: 'totp' },
      { id: 'c', status: 'verified', factor_type: 'totp' },
    ],
  }
  assert.deepEqual(verifiedFactors(user).map((f) => f.id), ['a', 'c'])
})

test('hasVerifiedFactor is false for missing or empty factor lists', () => {
  assert.equal(hasVerifiedFactor(null), false)
  assert.equal(hasVerifiedFactor({}), false)
  assert.equal(hasVerifiedFactor({ factors: undefined }), false)
  assert.equal(hasVerifiedFactor({ factors: [] }), false)
  assert.equal(hasVerifiedFactor({ factors: [{ status: 'unverified' }] }), false)
})

test('hasVerifiedFactor detects an enrolled account', () => {
  assert.equal(hasVerifiedFactor({ factors: [{ status: 'verified' }] }), true)
})

test('aalFromToken reads the aal claim from a JWT payload', () => {
  assert.equal(aalFromToken(tokenWith({ aal: 'aal2' })), 'aal2')
  assert.equal(aalFromToken(tokenWith({ aal: 'aal1' })), 'aal1')
})

test('aalFromToken returns null for malformed or unmarked tokens', () => {
  assert.equal(aalFromToken(undefined), null)
  assert.equal(aalFromToken('not-a-jwt'), null)
  assert.equal(aalFromToken('a.!!!.c'), null)
  assert.equal(aalFromToken(tokenWith({ sub: 'user-1' })), null)
})
