import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeChanges } from '../src/utils/auditChanges.js'

test('keeps a simple from/to pair', () => {
  const out = sanitizeChanges({ price: { from: 265, to: 299 } })
  assert.deepEqual(out, { price: { from: 265, to: 299 } })
})

test('keeps booleans and nulls', () => {
  const out = sanitizeChanges({ is_active: { from: true, to: false }, supplier: { from: 'Acme', to: null } })
  assert.deepEqual(out, {
    is_active: { from: true, to: false },
    supplier: { from: 'Acme', to: null },
  })
})

test('null when input is not a plain object', () => {
  assert.equal(sanitizeChanges(null), null)
  assert.equal(sanitizeChanges(undefined), null)
  assert.equal(sanitizeChanges('price'), null)
  assert.equal(sanitizeChanges([1, 2]), null)
})

test('null when there is nothing to store', () => {
  assert.equal(sanitizeChanges({}), null)
  assert.equal(sanitizeChanges({ a: {} }), null)
  assert.equal(sanitizeChanges({ a: { from: null, to: null } }), null)
})

test('truncates long strings and stringifies objects', () => {
  const long = 'x'.repeat(400)
  const out = sanitizeChanges({
    alt_text: { from: long, to: 'ok' },
    details: { from: [{ label: 'Ingredients', content: 'beef' }], to: null },
  })
  assert.equal(out.alt_text.from.length, 303) // 300 + '...'
  assert.ok(out.alt_text.from.endsWith('...'))
  assert.equal(out.alt_text.to, 'ok')
  assert.equal(typeof out.details.from, 'string')
  assert.equal(out.details.from, 'Ingredients: beef')
  assert.equal(out.details.to, null)
})

test('product info sections are stored as plain sentences, not JSON', () => {
  const out = sanitizeChanges({
    details: {
      from: null,
      to: [
        { label: 'Product Info', content: '- Name: Aozi (K) Tuna\n- Brand: Aozi' },
        { label: 'Feeding Guide', content: 'Serve daily | 2 cups' },
      ],
    },
  })
  assert.equal(out.details.to, 'Product Info: Name: Aozi (K) Tuna Brand: Aozi. Feeding Guide: Serve daily, 2 cups')
  assert.ok(!out.details.to.includes('[{'))
  assert.ok(!out.details.to.includes('\\n'))
})

test('caps the number of fields at 20', () => {
  const input = {}
  for (let i = 0; i < 30; i++) input[`f${i}`] = { from: i, to: i + 1 }
  const out = sanitizeChanges(input)
  assert.equal(Object.keys(out).length, 20)
  assert.deepEqual(out.f0, { from: 0, to: 1 })
})

test('truncates overlong field names', () => {
  const key = 'k'.repeat(200)
  const out = sanitizeChanges({ [key]: { from: 1, to: 2 } })
  const stored = Object.keys(out)[0]
  assert.equal(stored.length, 80)
})

test('treats a bare value as { from: null, to: value }', () => {
  const out = sanitizeChanges({ status: 'Shipped' })
  assert.deepEqual(out, { status: { from: null, to: 'Shipped' } })
})

test('drops entries where both sides clamp to null', () => {
  const out = sanitizeChanges({ weird: { from: undefined, to: () => {} } })
  assert.equal(out, null)
})
