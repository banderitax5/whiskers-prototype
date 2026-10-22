import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeDetails, MAX_SECTIONS, MAX_LABEL_LENGTH, MAX_CONTENT_LENGTH } from '../src/utils/productDetails.js'

const valid = [
  { label: 'Product Info', content: 'Complete and balanced.' },
  { label: 'Ingredients', content: 'Wheat, meat and bone meal.' },
]

test('null and undefined clear the column', () => {
  assert.deepEqual(sanitizeDetails(null), { value: null })
  assert.deepEqual(sanitizeDetails(undefined), { value: null })
})

test('non-array payloads are rejected', () => {
  for (const bad of ['text', 42, {}, true]) {
    assert.match(sanitizeDetails(bad).error, /list of sections/)
  }
})

test('a valid array is trimmed and keeps its order', () => {
  const { value, error } = sanitizeDetails([
    { label: '  Storage  ', content: '  Cool dry place.  ' },
    { label: 'Product Info', content: 'Adult dogs.' },
  ])
  assert.equal(error, undefined)
  assert.deepEqual(value, [
    { label: 'Storage', content: 'Cool dry place.' },
    { label: 'Product Info', content: 'Adult dogs.' },
  ])
})

test('rows without content are dropped, not stored', () => {
  const { value } = sanitizeDetails([
    { label: 'Feeding Guide', content: '' },
    { label: 'Ingredients', content: '   ' },
    { label: 'Product Info', content: 'Kept.' },
  ])
  assert.deepEqual(value, [{ label: 'Product Info', content: 'Kept.' }])
})

test('an entirely empty list normalizes to null', () => {
  assert.deepEqual(sanitizeDetails([]), { value: null })
  assert.deepEqual(sanitizeDetails([{ label: 'X', content: '' }]), { value: null })
})

test('content without a label is rejected', () => {
  assert.match(sanitizeDetails([{ label: '  ', content: 'orphan' }]).error, /needs a label/)
})

test('non-object rows are rejected', () => {
  assert.match(sanitizeDetails(['just a string']).error, /label and content/)
  assert.match(sanitizeDetails([[{ label: 'a', content: 'b' }]]).error, /label and content/)
  assert.match(sanitizeDetails([null]).error, /label and content/)
})

test('label and content length caps are enforced', () => {
  const longLabel = 'L'.repeat(MAX_LABEL_LENGTH + 1)
  assert.match(sanitizeDetails([{ label: longLabel, content: 'x' }]).error, /limited to 80 characters/)

  const longContent = 'c'.repeat(MAX_CONTENT_LENGTH + 1)
  assert.match(sanitizeDetails([{ label: 'Ok', content: longContent }]).error, /limited to 4000 characters/)

  // at the limit is fine
  const atLimit = sanitizeDetails([
    { label: 'L'.repeat(MAX_LABEL_LENGTH), content: 'c'.repeat(MAX_CONTENT_LENGTH) },
  ])
  assert.equal(atLimit.error, undefined)
  assert.equal(atLimit.value.length, 1)
})

test('the section count cap is enforced', () => {
  const tooMany = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({ label: `S${i}`, content: 'x' }))
  assert.match(sanitizeDetails(tooMany).error, /at most 12 sections/)

  const exactlyEnough = Array.from({ length: MAX_SECTIONS }, (_, i) => ({ label: `S${i}`, content: 'x' }))
  assert.equal(sanitizeDetails(exactlyEnough).error, undefined)
})

test('labelled rows with content are accepted for any label', () => {
  // no whitelist: admin-defined sections are a supported follow-up
  const { value } = sanitizeDetails([{ label: 'Size Chart', content: 'S | 40 cm' }])
  assert.deepEqual(value, [{ label: 'Size Chart', content: 'S | 40 cm' }])
})
