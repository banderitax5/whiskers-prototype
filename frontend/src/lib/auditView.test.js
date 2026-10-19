import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({
  apiGetAllPages: vi.fn(),
  apiGet: vi.fn(),
}))

import { apiGetAllPages, apiGet } from '../lib/api.js'
import {
  buildCsv, createResolver, dayKey, dayLabel, exactLabel, filterEntries,
  groupByDay, hasActiveFilters, inDateRange, relativeLabel, shortId, timeOnlyLabel, whoFor,
} from './auditView.js'

// noon in Manila on 2026-10-19
const NOW = new Date('2026-10-19T04:00:00Z')

describe('dayKey / dayLabel / relativeLabel (Manila time)', () => {
  it('labels today, yesterday, and older days', () => {
    expect(dayKey('2026-10-19T03:00:00Z')).toBe('2026-10-19')
    expect(dayLabel('2026-10-19', NOW)).toBe('Today')
    expect(dayLabel('2026-10-18', NOW)).toBe('Yesterday')
    expect(dayLabel('2026-10-13', NOW)).toBe('Oct 13')
  })

  it('keeps the year for other-year dates', () => {
    expect(dayLabel('2025-12-25', NOW)).toBe('Dec 25, 2025')
  })

  it('shows relative time only inside 24 hours', () => {
    expect(relativeLabel('2026-10-19T03:55:00Z', NOW)).toBe('5 minutes ago')
    expect(relativeLabel('2026-10-19T01:00:00Z', NOW)).toBe('3 hours ago')
    expect(relativeLabel('2026-10-18T03:00:00Z', NOW)).toBeNull()
    expect(relativeLabel(null, NOW)).toBeNull()
  })

  it('formats exact Manila stamps', () => {
    expect(exactLabel('2026-10-19T03:00:00Z')).toContain('Oct 19, 2026')
    expect(timeOnlyLabel('2026-10-19T03:00:00Z')).toMatch(/\d{2}:\d{2}/)
    expect(exactLabel('not-a-date')).toBe('Unknown time')
    expect(dayKey('not-a-date')).toBe('unknown')
  })
})

describe('groupByDay', () => {
  it('groups sorted rows under day headings in order', () => {
    const rows = [
      { id: '1', created_at: '2026-10-19T03:00:00Z' },
      { id: '2', created_at: '2026-10-19T02:00:00Z' },
      { id: '3', created_at: '2026-10-18T03:00:00Z' },
    ]
    const groups = groupByDay(rows, NOW)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['1', '2'])
    expect(groups[1].rows.map((r) => r.id)).toEqual(['3'])
  })
})

describe('inDateRange', () => {
  it('today starts at Manila midnight', () => {
    expect(inDateRange('2026-10-19T00:30:00Z', 'today', '', '', NOW)).toBe(true) // 08:30 Manila
    expect(inDateRange('2026-10-18T15:59:00Z', 'today', '', '', NOW)).toBe(false) // 23:59 Manila, still yesterday
    expect(inDateRange('2026-10-18T16:30:00Z', 'today', '', '', NOW)).toBe(true) // 00:30 Manila today
  })

  it('7 days includes the same window back', () => {
    expect(inDateRange('2026-10-13T04:00:00Z', '7', '', '', NOW)).toBe(true)
    expect(inDateRange('2026-10-12T03:00:00Z', '7', '', '', NOW)).toBe(false)
    expect(inDateRange('2026-10-19T03:00:00Z', 'all', '', '', NOW)).toBe(true)
  })

  it('custom compares day keys', () => {
    expect(inDateRange('2026-10-15T03:00:00Z', 'custom', '2026-10-14', '2026-10-16', NOW)).toBe(true)
    expect(inDateRange('2026-10-17T03:00:00Z', 'custom', '2026-10-14', '2026-10-16', NOW)).toBe(false)
  })
})

function entry(over = {}) {
  const { row: rowOver = {}, ...rest } = over
  return {
    sentence: 'You updated the store settings: Store name.',
    category: 'Settings',
    important: false,
    hidden: false,
    ...rest,
    row: {
      id: 'a1',
      action: 'settings_update',
      target: 'site_settings',
      details: 'updated: store_name',
      admin_email: 'admin@example.com',
      created_at: '2026-10-19T03:00:00Z',
      ...rowOver,
    },
  }
}

describe('filterEntries', () => {
  const entries = [
    entry(),
    entry({ important: true, row: { id: 'a2', action: 'delete', admin_email: 'juan@example.com' } }),
    entry({ hidden: true, category: 'Security', row: { id: 'a3', action: 'stepup_failed' } }),
  ]

  it('hides security rows unless asked', () => {
    expect(filterEntries(entries, {}, NOW).map((e) => e.row.id)).toEqual(['a1', 'a2'])
    expect(filterEntries(entries, { showSecurity: true }, NOW)).toHaveLength(3)
  })

  it('filters by important, category, person, and search text', () => {
    expect(filterEntries(entries, { importantOnly: true }, NOW).map((e) => e.row.id)).toEqual(['a2'])
    expect(filterEntries(entries, { category: 'Security', showSecurity: true }, NOW)).toHaveLength(1)
    expect(filterEntries(entries, { person: 'JUAN@example.com' }, NOW).map((e) => e.row.id)).toEqual(['a2'])
    expect(filterEntries(entries, { q: 'stepup' , showSecurity: true }, NOW).map((e) => e.row.id)).toEqual(['a3'])
  })

  it('filters by date range', () => {
    const old = entry({ row: { id: 'old', created_at: '2026-09-01T03:00:00Z' } }) // 48 days before NOW
    const list = [...entries, old]
    expect(filterEntries(list, { range: 'today' }, NOW).map((e) => e.row.id)).toEqual(['a1', 'a2'])
    expect(filterEntries(list, { range: '30' }, NOW).map((e) => e.row.id)).not.toContain('old')
    expect(filterEntries(list, { range: 'all' }, NOW).map((e) => e.row.id)).toContain('old')
  })
})

describe('hasActiveFilters', () => {
  it('detects any non-default filter', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ q: '  ', range: 'all', category: 'all', person: 'all' })).toBe(false)
    expect(hasActiveFilters({ q: 'x' })).toBe(true)
    expect(hasActiveFilters({ importantOnly: true })).toBe(true)
  })
})

describe('buildCsv', () => {
  it('writes a header, one row per entry, and escapes quotes', () => {
    const csv = buildCsv([entry({ sentence: 'You said "hi".' })])
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('What happened')
    expect(lines[0]).toContain('Admin email (raw)')
    expect(lines[1]).toContain('You said ""hi"".')
    expect(lines).toHaveLength(2)
  })
})

describe('whoFor / shortId', () => {
  it('maps the session email to You and blanks to Someone', () => {
    expect(whoFor('Admin@Example.com', 'admin@example.com')).toBe('You')
    expect(whoFor('other@example.com', 'admin@example.com')).toBe('other@example.com')
    expect(whoFor('unknown', 'admin@example.com')).toBe('Someone')
    expect(whoFor(null, 'admin@example.com')).toBe('Someone')
  })

  it('shortens long ids', () => {
    expect(shortId('0123456789abcdef')).toBe('01234567')
    expect(shortId('abc')).toBe('abc')
  })
})

describe('createResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves user and product targets and tolerates missing products', async () => {
    apiGetAllPages.mockResolvedValue({
      items: [{ id: '11111111-1111-1111-1111-111111111111', firstName: 'Juan', lastName: 'Dela Cruz' }],
    })
    apiGet.mockImplementation(async (path) => {
      if (path === '/products/22222222-2222-2222-2222-222222222222') return { prod_name: 'Royal Canin Adult 10kg' }
      throw new Error('404')
    })
    const resolver = createResolver()
    const rows = [
      { target: 'user:11111111-1111-1111-1111-111111111111' },
      { target: 'product:22222222-2222-2222-2222-222222222222' },
      { target: 'product:33333333-3333-3333-3333-333333333333' },
      { target: 'site_settings' },
    ]
    const { userName, productName } = await resolver.resolve(rows, 'tok')
    expect(apiGetAllPages).toHaveBeenCalledWith('/admin/customers', 'tok', { pageSize: 100, maxPages: 10 })
    expect(userName('11111111-1111-1111-1111-111111111111')).toBe('Juan Dela Cruz')
    expect(productName('22222222-2222-2222-2222-222222222222')).toBe('Royal Canin Adult 10kg')
    expect(productName('33333333-3333-3333-3333-333333333333')).toBeNull()
    expect(productName('unknown')).toBeNull()
  })

  it('never rejects when lookups fail', async () => {
    apiGetAllPages.mockRejectedValue(new Error('network'))
    apiGet.mockRejectedValue(new Error('network'))
    const resolver = createResolver()
    const { userName, productName } = await resolver.resolve(
      [{ target: 'user:11111111-1111-1111-1111-111111111111' }, { target: 'product:22222222-2222-2222-2222-222222222222' }],
      'tok'
    )
    expect(userName('11111111-1111-1111-1111-111111111111')).toBeNull()
    expect(productName('22222222-2222-2222-2222-222222222222')).toBeNull()
  })

  it('skips lookups when there is nothing to resolve', async () => {
    const resolver = createResolver()
    await resolver.resolve([{ target: 'site_settings' }, { target: 'hero' }], 'tok')
    expect(apiGetAllPages).not.toHaveBeenCalled()
    expect(apiGet).not.toHaveBeenCalled()
  })
})
