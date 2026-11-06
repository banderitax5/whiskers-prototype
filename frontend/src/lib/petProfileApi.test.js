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
      activity: 'normal',
      environment: 'both',
      breedSize: 'unknown',
    })
  })

  it('sends the daily-life answers for the species that asks the question', () => {
    const dog = toServerPet({ ...base, activity: 'high', environment: 'indoor', breedSize: 'large' })
    expect(dog.activity).toBe('high')
    // a dog is never asked where it lives, so the neutral answer is sent
    expect(dog.environment).toBe('both')
    expect(dog.breedSize).toBe('large')

    const cat = toServerPet({ ...base, species: 'cat', activity: 'low', environment: 'indoor', breedSize: 'small' })
    expect(cat.activity).toBe('low')
    expect(cat.environment).toBe('indoor')
    // a cat is never asked its breed size
    expect(cat.breedSize).toBe('unknown')
  })

  it('replaces a value the server would refuse with the neutral answer', () => {
    const pet = toServerPet({ ...base, activity: 'sleepy', environment: 'moon', breedSize: 'giant' })
    expect(pet.activity).toBe('normal')
    expect(pet.environment).toBe('both')
    expect(pet.breedSize).toBe('unknown')
  })

  it('keeps the neutral answers for a bird or a fish', () => {
    const bird = toServerPet({ ...base, species: 'bird', activity: 'high', environment: 'indoor', breedSize: 'small' })
    expect(bird.activity).toBe('normal')
    expect(bird.environment).toBe('both')
    expect(bird.breedSize).toBe('unknown')
  })

  it('sends an empty weight as null', () => {
    expect(toServerPet({ ...base, weight: '' }).weight).toBeNull()
    expect(toServerPet({ ...base, weight: null }).weight).toBeNull()
  })

  it('defaults a missing condition to healthy', () => {
    expect(toServerPet({ ...base, healthCondition: undefined }).healthCondition).toBe('healthy')
  })
})
