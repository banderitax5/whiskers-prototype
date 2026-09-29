import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')

const { signStepUpToken, verifyStepUpToken, getStepUpTtlSeconds } = await import('../src/utils/stepUp.js')

const USER_A = '11111111-1111-1111-1111-111111111111'
const USER_B = '22222222-2222-2222-2222-222222222222'

test('a freshly signed token verifies for the same user', () => {
  const token = signStepUpToken(USER_A)
  assert.equal(verifyStepUpToken(token, USER_A), true)
})

test('a token does not verify for a different user', () => {
  const token = signStepUpToken(USER_A)
  assert.equal(verifyStepUpToken(token, USER_B), false)
})

test('an expired token is rejected', () => {
  const token = signStepUpToken(USER_A, -10)
  assert.equal(verifyStepUpToken(token, USER_A), false)
})

test('a tampered payload is rejected', () => {
  const token = signStepUpToken(USER_A)
  const [body, sig] = token.split('.')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  payload.sub = USER_B
  const forged = Buffer.from(JSON.stringify(payload)).toString('base64url')
  assert.equal(verifyStepUpToken(`${forged}.${sig}`, USER_B), false)
})

test('a tampered signature is rejected', () => {
  const token = signStepUpToken(USER_A)
  const [body] = token.split('.')
  const badSig = crypto.randomBytes(32).toString('base64url')
  assert.equal(verifyStepUpToken(`${body}.${badSig}`, USER_A), false)
})

test('garbage input is rejected without throwing', () => {
  for (const value of [null, undefined, 42, '', 'nope', 'a.b.c', '...', 'x.y']) {
    assert.equal(verifyStepUpToken(value, USER_A), false)
  }
})

test('default ttl is 300 seconds when unset', () => {
  delete process.env.STEP_UP_TTL_SECONDS
  assert.equal(getStepUpTtlSeconds(), 300)
})
