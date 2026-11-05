import { describe, it, expect } from 'vitest'
import {
  STAGE_AGE_RULES,
  parseDateInput,
  monthsBetween,
  computeLifeStage,
  formatAge,
  todayInputValue,
  withCurrentLifeStage,
} from './petAge'
import { LIFE_STAGE_OPTIONS, getLifeStageOptions } from '../data/petFormOptions'

const at = (iso) => new Date(`${iso}T12:00:00`)

describe('parseDateInput', () => {
  it('reads a date input without a timezone shift', () => {
    const d = parseDateInput('2021-03-04')
    expect(d.getFullYear()).toBe(2021)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(4)
  })

  it('rejects impossible and empty values', () => {
    expect(parseDateInput('2024-02-31')).toBeNull()
    expect(parseDateInput('')).toBeNull()
    expect(parseDateInput(null)).toBeNull()
    expect(parseDateInput('not a date')).toBeNull()
  })
})

describe('monthsBetween', () => {
  it('counts whole months only once the day has come round', () => {
    expect(monthsBetween('2024-01-15', at('2025-01-14'))).toBe(11)
    expect(monthsBetween('2024-01-15', at('2025-01-15'))).toBe(12)
    expect(monthsBetween('2024-01-15', at('2025-02-16'))).toBe(13)
  })

  it('returns null for a birth date in the future', () => {
    expect(monthsBetween('2030-01-01', at('2026-01-01'))).toBeNull()
  })
})

describe('computeLifeStage', () => {
  it('moves a dog puppy to adult on its first birthday', () => {
    const now = at('2026-06-01')
    expect(computeLifeStage('dog', '2026-01-01', now)).toBe('puppy')
    expect(computeLifeStage('dog', '2025-06-01', now)).toBe('adult')
  })

  it('moves a dog to senior at seven years', () => {
    const now = at('2026-06-01')
    expect(computeLifeStage('dog', '2019-06-02', now)).toBe('adult')
    expect(computeLifeStage('dog', '2019-06-01', now)).toBe('senior')
  })

  it('moves a cat to senior at ten years', () => {
    const now = at('2026-06-01')
    expect(computeLifeStage('cat', '2016-06-02', now)).toBe('adult')
    expect(computeLifeStage('cat', '2016-06-01', now)).toBe('senior')
  })

  it('uses the growth and senior stages the bird and fish forms offer', () => {
    const now = at('2026-06-01')
    expect(computeLifeStage('bird', '2026-01-01', now)).toBe('juvenile')
    expect(computeLifeStage('bird', '2022-01-01', now)).toBe('adult')
    expect(computeLifeStage('bird', '2019-01-01', now)).toBe('senior')
    expect(computeLifeStage('fish', '2026-04-01', now)).toBe('juvenile')
    expect(computeLifeStage('fish', '2020-01-01', now)).toBe('adult')
  })

  it('returns null when the date or species is missing', () => {
    expect(computeLifeStage('dog', '', at('2026-06-01'))).toBeNull()
    expect(computeLifeStage('hamster', '2020-01-01', at('2026-06-01'))).toBeNull()
    expect(computeLifeStage('dog', '2030-01-01', at('2026-06-01'))).toBeNull()
  })

  it('only ever returns a stage the form offers for that species', () => {
    for (const species of Object.keys(STAGE_AGE_RULES)) {
      const offered = getLifeStageOptions(species).map((o) => o.value)
      for (const rule of STAGE_AGE_RULES[species]) {
        expect(offered).toContain(rule.stage)
      }
      // every option has a rule, so the form and the rules cannot drift apart
      for (const stage of offered) {
        expect(STAGE_AGE_RULES[species].map((r) => r.stage)).toContain(stage)
      }
      expect(LIFE_STAGE_OPTIONS[species]).toBeDefined()
    }
  })
})

describe('formatAge', () => {
  it('reads in months below a year and in years after that', () => {
    const now = at('2026-06-01')
    expect(formatAge('2026-04-01', now)).toBe('2 months')
    expect(formatAge('2026-05-01', now)).toBe('1 month')
    expect(formatAge('2024-06-01', now)).toBe('2 years')
    expect(formatAge('2024-03-01', now)).toBe('2 years 3 months')
  })

  it('returns null without a usable date', () => {
    expect(formatAge('', at('2026-06-01'))).toBeNull()
    expect(formatAge('2030-01-01', at('2026-06-01'))).toBeNull()
  })
})

describe('todayInputValue', () => {
  it('pads the month and day for the date input', () => {
    expect(todayInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayInputValue(new Date(2026, 10, 23))).toBe('2026-11-23')
  })
})

describe('withCurrentLifeStage', () => {
  const now = at('2026-06-01')

  it('moves a pet saved as a puppy into the adult stage a year later', () => {
    const pet = { id: 'pet-1', species: 'dog', birthDate: '2025-01-01', lifeStage: 'puppy' }
    expect(withCurrentLifeStage(pet, now).lifeStage).toBe('adult')
  })

  it('leaves a hand-picked stage alone', () => {
    const pet = {
      id: 'pet-1',
      species: 'dog',
      birthDate: '2025-01-01',
      lifeStage: 'senior',
      stageSource: 'manual',
    }
    expect(withCurrentLifeStage(pet, now)).toBe(pet)
  })

  it('leaves a pet without a birth date alone', () => {
    const pet = { id: 'pet-1', species: 'dog', lifeStage: 'puppy' }
    expect(withCurrentLifeStage(pet, now)).toBe(pet)
  })

  it('returns the same object when nothing changed, so storage is not rewritten', () => {
    const pet = { id: 'pet-1', species: 'dog', birthDate: '2025-01-01', lifeStage: 'adult' }
    expect(withCurrentLifeStage(pet, now)).toBe(pet)
  })
})
