import { describe, it, expect } from 'vitest'
import { dateWindowError, END_BEFORE_START } from './scheduleWindow'

describe('dateWindowError', () => {
  it('rejects an end date before the start date', () => {
    expect(dateWindowError('2026-10-20T14:30', '2026-10-19T14:30')).toBe(END_BEFORE_START)
  })

  it('rejects an end date equal to the start date (zero-length window)', () => {
    expect(dateWindowError('2026-10-20T14:30', '2026-10-20T14:30')).toBe(END_BEFORE_START)
  })

  it('accepts a valid window and one-sided dates', () => {
    expect(dateWindowError('2026-10-20T14:30', '2026-10-21T14:30')).toBe('')
    expect(dateWindowError('2026-10-20T14:30', '')).toBe('')
    expect(dateWindowError('', '2026-10-21T14:30')).toBe('')
    expect(dateWindowError('', '')).toBe('')
  })
})
