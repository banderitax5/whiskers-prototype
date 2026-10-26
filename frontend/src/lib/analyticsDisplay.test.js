import { describe, expect, test } from 'vitest'
import {
  bucketLabel,
  compactPesos,
  deltaPct,
  formatPct,
  funnelSteps,
  orderStatusRows,
  pct,
} from './analyticsDisplay'

describe('analyticsDisplay', () => {
  test('pct and formatPct handle missing data', () => {
    expect(pct(1, 4)).toBe(25)
    expect(pct(1, 0)).toBeNull()
    expect(pct('x', 4)).toBeNull()
    expect(formatPct(12.345, 1)).toBe('12.3%')
    expect(formatPct(null)).toBe('—')
  })

  test('deltaPct needs a non-zero baseline', () => {
    expect(deltaPct(150, 100)).toBe(50)
    expect(deltaPct(50, 0)).toBeNull()
    expect(deltaPct('x', 100)).toBeNull()
  })

  test('compactPesos keeps the KPI subtitle short', () => {
    expect(compactPesos(0)).toBe('PHP 0')
    expect(compactPesos(950)).toBe('PHP 950')
    expect(compactPesos(1500)).toBe('PHP 1.5k')
    expect(compactPesos(2_500_000)).toBe('PHP 2.5M')
  })

  test('funnelSteps returns step rates, drop-off and overall conversion', () => {
    const steps = funnelSteps({
      page_view: 100,
      product_view: 50,
      add_to_cart: 10,
      checkout_complete: 5,
    })

    expect(steps.map((step) => step.count)).toEqual([100, 50, 10, 5])
    expect(steps[0].rate).toBeNull()
    expect(steps[1].rate).toBe(50)
    expect(steps[1].dropoff).toBe(50)
    expect(steps[2].rate).toBe(20)
    expect(steps[3].overall).toBe(5)
  })

  test('orderStatusRows uses the stable status order and appends unknown statuses', () => {
    const rows = orderStatusRows([
      { status: 'Refunded', count: 1 },
      { status: 'Cancelled', count: 1 },
      { status: 'Pending', count: 2 },
      { status: 'Delivered', count: 1 },
    ])

    expect(rows.map((row) => row.name)).toEqual(['Pending', 'Delivered', 'Cancelled', 'Refunded'])
    expect(rows.map((row) => row.pct)).toEqual([40, 20, 20, 20])
    expect(rows.map((row) => row.tone)).toEqual(['warning', 'success', 'danger', 'neutral'])
  })

  test('bucketLabel formats daily, monthly and yearly keys', () => {
    expect(bucketLabel('2026-10-07', 'daily')).toBe('Oct 7')
    expect(bucketLabel('2025-11', 'monthly')).toBe('Nov 2025')
    expect(bucketLabel('2026', 'yearly')).toBe('2026')
    expect(bucketLabel('', 'daily')).toBe('')
  })
})
