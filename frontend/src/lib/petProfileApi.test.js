import { describe, it, expect } from 'vitest'
import { toServerAllergies, toServerPet } from './petProfileApi'

const base = {
  id: 'pet-1',
  name: 'Mochi',
  species: 'dog',
  lifeStage: 'adult',
  birthDate: '2021-05-01',
  weight: 12.5,
  neutered: 'yes',
  healthCondition: 'healthy',
  allergies: ['chicken'],
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('toServerAllergies', () => {
  it('drops "none" because the server stores an empty list instead', () => {
    expect(toServerAllergies(['none'])).toEqual([])
    expect(toServerAllergies(['none', 'chicken'])).toEqual(['chicken'])
  })

  it('lowercases, trims and removes duplicates', () => {
    expect(toServerAllergies([' Chicken ', 'chicken', 'FISH'])).toEqual(['chicken', 'fish'])
  })

  it('drops a value the server would refuse', () => {
    expect(toServerAllergies(['chicken', 'mystery', 'wheat'])).toEqual(['chicken'])
  })
})

describe('toServerPet', () => {
  it('sends only the profile fields the API accepts', () => {
    expect(toServerPet(base)).toEqual({
      name: 'Mochi',
      species: 'dog',
      lifeStage: 'adult',
      stageSource: 'birthDate',
      birthDate: '2021-05-01',
      weight: 12.5,
      neutered: 'yes',
      healthCondition: 'healthy',
      allergies: ['chicken'],
    })
  })

  it('sends an empty weight as null', () => {
    expect(toServerPet({ ...base, weight: '' }).weight).toBeNull()
    expect(toServerPet({ ...base, weight: null }).weight).toBeNull()
  })

  it('defaults a missing condition to healthy', () => {
    expect(toServerPet({ ...base, healthCondition: undefined }).healthCondition).toBe('healthy')
  })
})
