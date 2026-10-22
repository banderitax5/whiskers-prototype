import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

// contentHistory.js imports the shared supabase clients at module load; dummy
// env values let createClient succeed without a real project (no network call
// happens at import time)
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'

const { diffChanges, historyLabel } = await import('../src/utils/contentHistory.js')

describe('diffChanges', () => {
  test('reports only fields whose values actually changed, with from/to', () => {
    const before = { title: 'Old', alt: 'Same', sort_order: 1 }
    const after = { title: 'New', alt: 'Same', sort_order: 1 }
    assert.deepEqual(diffChanges(before, after, ['title', 'alt', 'sort_order']), {
      title: { from: 'Old', to: 'New' },
    })
  })

  test('an unchanged field the admin resubmitted produces no entry', () => {
    assert.deepEqual(diffChanges({ label: 'Dogs' }, { label: 'Dogs' }, ['label']), {})
  })

  test('null and undefined count as the same (missing) value', () => {
    assert.deepEqual(diffChanges({ ends_at: null }, {}, ['ends_at']), {})
    assert.deepEqual(diffChanges({}, { ends_at: null }, ['ends_at']), {})
  })

  test('bookkeeping and counter columns are never reported as changes', () => {
    const after = { title: 'Same', updated_at: '2026-10-15T00:00:00Z', created_at: 'x', impressions: 12, clicks: 3 }
    const before = { title: 'Same', updated_at: '2026-10-14T00:00:00Z', created_at: 'x', impressions: 4, clicks: 1 }
    assert.deepEqual(diffChanges(before, after), {})
  })

  test('nested plain objects flatten to "parent · child" keys', () => {
    const before = { payment_methods: { gcash: { enabled: true }, cod: { enabled: false } } }
    const after = { payment_methods: { gcash: { enabled: false }, cod: { enabled: false } } }
    assert.deepEqual(diffChanges(before, after, ['payment_methods']), {
      'payment_methods · gcash · enabled': { from: true, to: false },
    })
  })

  test('arrays compare whole and keep their values', () => {
    const before = { ids: ['a', 'b'] }
    const after = { ids: ['b', 'a'] }
    assert.deepEqual(diffChanges(before, after, ['ids']), {
      ids: { from: ['a', 'b'], to: ['b', 'a'] },
    })
    assert.deepEqual(diffChanges({ ids: ['a'] }, { ids: ['a'] }, ['ids']), {})
  })

  test('default field list is every key of after', () => {
    assert.deepEqual(diffChanges({ a: 1, b: 2 }, { a: 1, b: 3 }), { b: { from: 2, to: 3 } })
  })

  test('a brand-new nested key is a change (undefined -> value)', () => {
    assert.deepEqual(diffChanges({}, { title: 'Hi' }, ['title']), {
      title: { from: null, to: 'Hi' },
    })
  })
})

describe('historyLabel', () => {
  test('picks the first non-blank label column', () => {
    assert.equal(historyLabel({ title: '', alt: 'Sale banner' }, 'title', 'alt'), 'Sale banner')
    assert.equal(historyLabel({ title: 'Hero', alt: 'x' }, 'title', 'alt'), 'Hero')
  })

  test('trims whitespace and returns null when nothing qualifies', () => {
    assert.equal(historyLabel({ label: '  Menu  ' }, 'label'), 'Menu')
    assert.equal(historyLabel({ title: '   ', alt: null }, 'title', 'alt'), null)
    assert.equal(historyLabel(null, 'title'), null)
  })
})
