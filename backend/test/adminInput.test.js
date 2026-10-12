import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeProductCreate,
  sanitizeProductPatch,
  parseProductListQuery,
  escapeLike,
  MAX_PRICE_PHP,
} from '../src/utils/adminInput.js'

test('create: requires name, category, price', () => {
  assert.ok(sanitizeProductCreate({}).error)
  assert.ok(sanitizeProductCreate({ prod_name: 'X' }).error)
  assert.ok(sanitizeProductCreate({ prod_name: 'X', category: 'Dogs', price: null }).error)
})

test('create: accepts a valid payload and trims text', () => {
  const { value, error } = sanitizeProductCreate({
    prod_name: '  Alpha Pro  ',
    category: ' Dogs - DRY ',
    brand: ' Royal Canin ',
    price: '800',
    stock_quantity: '5',
  })
  assert.equal(error, undefined)
  assert.equal(value.prod_name, 'Alpha Pro')
  assert.equal(value.category, 'Dogs - DRY')
  assert.equal(value.brand, 'Royal Canin')
  assert.equal(value.price, 800)
  assert.equal(value.stock_quantity, 5)
  assert.equal(value.is_active, true)
})

test('create: rejects negative, NaN, and huge prices', () => {
  assert.ok(sanitizeProductCreate({ prod_name: 'A', category: 'B', price: -1 }).error)
  assert.ok(sanitizeProductCreate({ prod_name: 'A', category: 'B', price: 'abc' }).error)
  assert.ok(sanitizeProductCreate({ prod_name: 'A', category: 'B', price: MAX_PRICE_PHP + 1 }).error)
  assert.ok(sanitizeProductCreate({ prod_name: 'A', category: 'B', price: true }).error)
})

test('create: rejects fractional/negative stock and non-boolean is_active', () => {
  const base = { prod_name: 'A', category: 'B', price: 1 }
  assert.ok(sanitizeProductCreate({ ...base, stock_quantity: 1.5 }).error)
  assert.ok(sanitizeProductCreate({ ...base, stock_quantity: -1 }).error)
  assert.ok(sanitizeProductCreate({ ...base, is_active: 'yes' }).error)
  assert.equal(sanitizeProductCreate({ ...base }).value.stock_quantity, 0)
})

test('create: empty brand becomes null, long names rejected', () => {
  assert.equal(sanitizeProductCreate({ prod_name: 'A', category: 'B', price: 1, brand: '   ' }).value.brand, null)
  assert.ok(sanitizeProductCreate({ prod_name: 'x'.repeat(201), category: 'B', price: 1 }).error)
})

test('patch: only allowed fields pass through', () => {
  const { updates, error } = sanitizeProductPatch({ price: 10, hacker: 'nope' })
  assert.equal(error, undefined)
  assert.deepEqual(Object.keys(updates), ['price'])
  assert.equal(updates.price, 10)
})

test('patch: empty body rejected, per-field checks', () => {
  assert.ok(sanitizeProductPatch({}).error)
  assert.ok(sanitizeProductPatch({ price: 'abc' }).error)
  assert.ok(sanitizeProductPatch({ price: -5 }).error)
  assert.ok(sanitizeProductPatch({ price: true }).error)
  assert.ok(sanitizeProductPatch({ prod_name: '   ' }).error)
  assert.ok(sanitizeProductPatch({ stock_quantity: 2.5 }).error)
  assert.ok(sanitizeProductPatch({ is_active: 1 }).error)
})

test('patch: brand empty string clears to null', () => {
  assert.equal(sanitizeProductPatch({ brand: '  ' }).updates.brand, null)
  assert.equal(sanitizeProductPatch({ brand: null }).updates.brand, null)
  assert.equal(sanitizeProductPatch({ brand: 'Aozi' }).updates.brand, 'Aozi')
})

test('list query: whitelist sort + sane filters', () => {
  const a = parseProductListQuery({ q: '  alpha ', sort: 'price_asc', active: 'true', category: 'Dogs' })
  assert.equal(a.q, 'alpha')
  assert.equal(a.sort.column, 'price')
  assert.equal(a.sort.ascending, true)
  assert.equal(a.active, true)
  assert.equal(a.category, 'Dogs')

  const b = parseProductListQuery({ sort: 'drop table', active: 'maybe' })
  assert.equal(b.sort.column, 'created_at')
  assert.equal(b.sort.ascending, false)
  assert.equal(b.active, null)
})

test('escapeLike neutralizes % and _', () => {
  assert.equal(escapeLike('50%_off'), '50\\%\\_off')
})
