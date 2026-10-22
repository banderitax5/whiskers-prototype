import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveUnitPrice, lineCost, lineMargin } from '../src/utils/orderCosting.js'

test('effective price: prefers the unit_price snapshot', () => {
  assert.equal(effectiveUnitPrice({ unit_price: 265, quantity: 2, subtotal: 530 }), 265)
})

test('effective price: falls back to subtotal/quantity for pre-M3 rows', () => {
  assert.equal(effectiveUnitPrice({ quantity: 3, subtotal: 795 }), 265)
})

test('effective price: spreads a per-line discount across units', () => {
  assert.equal(
    effectiveUnitPrice({ unit_price: 100, quantity: 4, subtotal: 400, discount_amount: 40 }),
    90,
  )
})

test('effective price: legacy row with discount falls back to subtotal', () => {
  assert.equal(
    effectiveUnitPrice({ quantity: 2, subtotal: 500, discount_amount: 100 }),
    200,
  )
})

test('effective price: zero or missing quantity returns 0, no NaN', () => {
  assert.equal(effectiveUnitPrice({ quantity: 0, subtotal: 100 }), 0)
  assert.equal(effectiveUnitPrice({}), 0)
  assert.equal(effectiveUnitPrice(null), 0)
})

test('effective price: rounds to centavos', () => {
  // 100 / 3 = 33.333... -> 33.33
  assert.equal(effectiveUnitPrice({ quantity: 3, subtotal: 100 }), 33.33)
})

test('line cost: multiplies unit_cost by quantity', () => {
  assert.equal(lineCost({ unit_cost: 5.5, quantity: 2 }), 11)
})

test('line cost: unknown cost stays null (never guessed)', () => {
  assert.equal(lineCost({ quantity: 2 }), null)
  assert.equal(lineCost({ unit_cost: null, quantity: 2 }), null)
  assert.equal(lineCost({ unit_cost: 5, quantity: 0 }), null)
})

test('line margin: revenue minus cost, negative allowed', () => {
  // sold below cost on purpose (E2E probe): 2 - 5.5 = -3.5
  assert.equal(lineMargin({ unit_price: 2, unit_cost: 5.5, quantity: 1, subtotal: 2 }), -3.5)
  assert.equal(lineMargin({ unit_price: 10, unit_cost: 4, quantity: 3, subtotal: 30 }), 18)
})

test('line margin: null when cost unknown', () => {
  assert.equal(lineMargin({ unit_price: 10, quantity: 1, subtotal: 10 }), null)
})
