import test from 'node:test'
import assert from 'node:assert/strict'

// encryption.js (imported by actorIndex) throws at import time without a
// valid key; give it one before the dynamic import. Plain (non-enc:) values
// pass through decryptText unchanged, so fixtures can use readable names.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const { buildActorIndex } = await import('../src/utils/actorIndex.js')

test('joins auth users to decrypted profile names by id, lowercases emails', () => {
  const profiles = [
    { id: 'u1', first_name: 'Juan', last_name: 'Dela Cruz' },
    { id: 'u2', first_name: 'Ana', last_name: null },
  ]
  const users = [
    { id: 'u1', email: 'Admin@Example.com' },
    { id: 'u2', email: 'ana@example.com' },
    { id: 'u3', email: 'ghost@example.com' }, // auth user with no profile row
  ]
  const { byEmail, byId } = buildActorIndex(profiles, users)
  assert.deepEqual(byEmail.get('admin@example.com'), { id: 'u1', name: 'Juan Dela Cruz' })
  assert.deepEqual(byEmail.get('ana@example.com'), { id: 'u2', name: 'Ana' })
  assert.deepEqual(byEmail.get('ghost@example.com'), { id: 'u3', name: null })
  assert.deepEqual(byId.get('u1'), { email: 'admin@example.com', name: 'Juan Dela Cruz' })
})

test('skips rows without id or email', () => {
  const { byEmail, byId } = buildActorIndex(
    [null, { id: 'u1' }, { first_name: 'A' }],
    [null, { id: 'u1' }, { email: 'a@b.c' }, { id: '', email: 'x@y.z' }],
  )
  assert.equal(byEmail.size, 0)
  assert.equal(byId.size, 0)
})

test('tolerates empty inputs', () => {
  const { byEmail, byId } = buildActorIndex(null, undefined)
  assert.equal(byEmail.size, 0)
  assert.equal(byId.size, 0)
})

test('duplicate emails keep the last entry', () => {
  const { byEmail } = buildActorIndex([], [
    { id: 'u1', email: 'a@b.c' },
    { id: 'u2', email: 'a@b.c' },
  ])
  assert.equal(byEmail.get('a@b.c').id, 'u2')
})
