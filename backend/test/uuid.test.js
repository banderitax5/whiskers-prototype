import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUuid, UUID_RE } from '../src/utils/uuid.js'

test('isUuid accepts a valid UUID v4', () => {
  assert.equal(isUuid('123e4567-e89b-42d3-a456-426614174000'), true)
  assert.equal(isUuid('  123e4567-e89b-42d3-a456-426614174000  '), true) // trims
})

test('isUuid rejects malformed and empty ids', () => {
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(isUuid('12345'), false)
  assert.equal(isUuid(''), false)
  assert.equal(isUuid(null), false)
  assert.equal(isUuid(undefined), false)
  // right shape but non-hex characters
  assert.equal(isUuid('123e4567-e89b-42d3-z456-426614174000'), false)
})

test('UUID_RE is case-insensitive', () => {
  assert.equal(UUID_RE.test('123E4567-E89B-42D3-A456-426614174000'), true)
})
