import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeSection, sanitizeRowConfig, SECTION_TYPES } from '../src/utils/sectionRules.js'

const uuid = '11111111-2222-3333-4444-555555555555'
const base = { type: 'product_row', title: 'Dogs we love', status: 'published', config: { rule: 'newest' } }

describe('sanitizeRowConfig', () => {
  test('manual requires a non-empty uuid list capped at 12', () => {
    assert.match(sanitizeRowConfig({ rule: 'manual' }).error, /at least one/)
    assert.match(sanitizeRowConfig({ rule: 'manual', product_ids: ['x'] }).error, /uuids/)
    assert.equal(sanitizeRowConfig({ rule: 'manual', product_ids: [uuid] }).ok, true)
    const many = Array.from({ length: 13 }, () => uuid)
    assert.match(sanitizeRowConfig({ rule: 'manual', product_ids: many }).error, /at most/)
  })

  test('category and brand fold into rule:Name and require a name', () => {
    const cat = sanitizeRowConfig({ rule: 'category', name: 'Dogs' })
    assert.equal(cat.value.rule, 'category:Dogs')
    assert.match(sanitizeRowConfig({ rule: 'brand' }).error, /name is required/)
  })

  test('newest needs nothing; unknown rules fall back safely', () => {
    assert.deepEqual(sanitizeRowConfig({ rule: 'newest' }).value, { rule: 'newest' })
    assert.match(sanitizeRowConfig({ rule: 'best_sellers_30d' }).error, /Rule must be/)
  })
})

describe('sanitizeSection create', () => {
  test('accepts a published product row and normalizes config', () => {
    const r = sanitizeSection({ ...base, config: { rule: 'category', name: 'Cats' } })
    assert.equal(r.ok, true)
    assert.deepEqual(r.values.config, { rule: 'category:Cats' })
    assert.equal(r.values.starts_at, null)
  })

  test('rejects unknown type, missing title and unknown rule', () => {
    assert.match(sanitizeSection({ ...base, type: 'hero' }).error, /Type must be/)
    assert.match(sanitizeSection({ ...base, title: '  ' }).error, /Title is required/)
    assert.match(sanitizeSection({ ...base, config: { rule: 'nope' } }).error, /Rule must be/)
  })

  test('every section type the admin offers is valid', () => {
    for (const t of SECTION_TYPES) {
      const r = sanitizeSection({ ...base, type: t, config: t === 'product_row' ? { rule: 'newest' } : {} })
      assert.equal(r.ok, true, t)
    }
  })

  test('scheduled needs a start; ends after starts', () => {
    assert.match(sanitizeSection({ ...base, status: 'scheduled' }).error, /start date/i)
    assert.match(sanitizeSection({ ...base, status: 'scheduled', starts_at: '2026-11-01T00:00:00+08:00', ends_at: '2026-10-01T00:00:00+08:00' }).error, /after/)
    assert.equal(sanitizeSection({ ...base, status: 'scheduled', starts_at: '2026-10-01T00:00:00+08:00', ends_at: '2026-11-01T00:00:00+08:00' }).ok, true)
  })

  test('non product_row types get an empty config', () => {
    assert.deepEqual(sanitizeSection({ ...base, type: 'text_block', config: { junk: 1 } }).values.config, {})
  })
})

describe('sanitizeSection partial', () => {
  test('patch only touches provided fields', () => {
    const r = sanitizeSection({ title: 'New title' }, { partial: true })
    assert.equal(r.ok, true)
    assert.deepEqual(Object.keys(r.values), ['title'])
  })

  test('config patch validates as product_row when the caller passes the existing type', () => {
    const r = sanitizeSection({ type: 'product_row', config: { rule: 'brand', name: 'Aozi' } }, { partial: true })
    assert.equal(r.ok, true)
    assert.deepEqual(r.values.config, { rule: 'brand:Aozi' })
    assert.match(sanitizeSection({ config: { rule: 'brand', name: 'Aozi' } }, { partial: true }).error, /type is required/)
  })
})
