import { test } from 'node:test'
import assert from 'node:assert/strict'

// importing the auth middleware also loads the Supabase config,
// which reads env at import time — provide harmless stand-ins when
// running outside a configured dev shell
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key'
process.env.SUPABASE_ANON_KEY ||= 'test-anon-key'

const { requireAdmin, requireStaff } = await import('../src/middleware/auth.js')

function mockRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

test('requireStaff admits admin and staff who have enrolled a second factor', () => {
  for (const role of ['admin', 'staff']) {
    const res = mockRes()
    let nextCalled = false
    requireStaff({ userRole: role, mfaEnabled: true }, res, () => { nextCalled = true })
    assert.equal(nextCalled, true, `${role} should pass requireStaff`)
    assert.equal(res.statusCode, 200)
  }
})

test('requireStaff rejects a plain user with 403', () => {
  const res = mockRes()
  let nextCalled = false
  requireStaff({ userRole: 'user', mfaEnabled: true }, res, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
  assert.match(res.body.error, /staff or admin/i)
})

test('requireStaff sends admin/staff without a second factor to enrollment', () => {
  for (const role of ['admin', 'staff']) {
    const res = mockRes()
    let nextCalled = false
    requireStaff({ userRole: role, mfaEnabled: false }, res, () => { nextCalled = true })
    assert.equal(nextCalled, false, `${role} must enroll before using the panel`)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'MFA_ENROLLMENT_REQUIRED')
  }
})

test('requireAdmin still rejects staff (admin-only routes stay admin-only)', () => {
  const res = mockRes()
  let nextCalled = false
  requireAdmin({ userRole: 'staff', mfaEnabled: true }, res, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)

  const res2 = mockRes()
  let next2 = false
  requireAdmin({ userRole: 'admin', mfaEnabled: true }, res2, () => { next2 = true })
  assert.equal(next2, true)
})

test('requireAdmin requires enrollment for admins without a second factor', () => {
  const res = mockRes()
  let nextCalled = false
  requireAdmin({ userRole: 'admin', mfaEnabled: false }, res, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.code, 'MFA_ENROLLMENT_REQUIRED')
})
