import { describe, it, expect } from 'vitest'
import {
  ALLERGY_OPTIONS,
  allergyLabels,
  canonicalAllergy,
  findLabel,
  findShortLabel,
} from './petFormOptions'

describe('canonicalAllergy', () => {
  it('keeps the values the form offers', () => {
    expect(canonicalAllergy('chicken')).toBe('chicken')
    expect(canonicalAllergy('grain')).toBe('grain')
  })

  it('folds an older name onto the value the form and engine use', () => {
    expect(canonicalAllergy('wheat')).toBe('grain')
    expect(canonicalAllergy('seafood')).toBe('fish')
    expect(canonicalAllergy('milk')).toBe('dairy')
    expect(canonicalAllergy('eggs')).toBe('egg')
  })

  it('trims and lowercases what came out of storage', () => {
    expect(canonicalAllergy('  Chicken ')).toBe('chicken')
  })
})

describe('allergyLabels', () => {
  it('shows the readable label for a stored code', () => {
    expect(allergyLabels(['chicken', 'fish'])).toEqual(['Chicken', 'Fish / Seafood'])
  })

  it('drops "none" and empties', () => {
    expect(allergyLabels(['none'])).toEqual([])
    expect(allergyLabels(['chicken', 'none', '', null])).toEqual(['Chicken'])
    expect(allergyLabels(undefined)).toEqual([])
    expect(allergyLabels(null)).toEqual([])
  })

  it('shows an old name as today\'s label, not the stored value', () => {
    expect(allergyLabels(['wheat', 'seafood'])).toEqual(['Grain / Wheat', 'Fish / Seafood'])
  })

  it('removes duplicates, even when two names mean the same allergen', () => {
    expect(allergyLabels(['grain', 'wheat'])).toEqual(['Grain / Wheat'])
  })

  it('turns an unknown value into words instead of printing the code', () => {
    expect(allergyLabels(['sensitive-stomach'])).toEqual(['Sensitive stomach'])
    expect(allergyLabels(['mystery'])).toEqual(['Mystery'])
  })

  it('never returns a hyphenated raw code', () => {
    for (const label of allergyLabels(['fish-meal', 'poultry', 'gluten-free'])) {
      expect(label).not.toMatch(/[-_]/)
    }
  })
})

describe('findLabel', () => {
  it('still returns the label for a known value', () => {
    expect(findLabel(ALLERGY_OPTIONS, 'beef')).toBe('Beef')
  })

  it('humanizes an unknown value so a code is never printed', () => {
    expect(findLabel(ALLERGY_OPTIONS, 'weight-management')).toBe('Weight management')
  })
})

describe('findShortLabel', () => {
  it('removes a trailing bracket from a known label', () => {
    expect(findShortLabel([{ value: 'adult', label: 'Adult (1 - 7 years)' }], 'adult')).toBe('Adult')
  })
})
