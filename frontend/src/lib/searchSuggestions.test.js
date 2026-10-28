import { describe, it, expect } from 'vitest'
import { suggestPhrases } from './searchSuggestions'

describe('suggestPhrases', () => {
  it('shows nothing for an empty or one-letter query', () => {
    expect(suggestPhrases('')).toEqual([])
    expect(suggestPhrases('f')).toEqual([])
  })

  it('suggests food for dog and cat when "food for" is typed', () => {
    const s = suggestPhrases('food for')
    expect(s).toContain('food for dog')
    expect(s).toContain('food for cat')
  })

  it('still matches with a typo, e.g. "fod for"', () => {
    expect(suggestPhrases('fod for')).toContain('food for dog')
  })

  it('puts phrases that start with the typed text first', () => {
    const s = suggestPhrases('cat')
    expect(s[0].startsWith('cat')).toBe(true)
  })

  it('returns no more than the limit', () => {
    expect(suggestPhrases('for', 3).length).toBeLessThanOrEqual(3)
  })

  it('returns nothing for text that matches no phrase', () => {
    expect(suggestPhrases('xyzzy')).toEqual([])
  })
})
