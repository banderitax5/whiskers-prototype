import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PETS,
  MSG,
  normalizeAllergies,
  normalizeBirthDate,
  normalizeName,
  normalizePetProfile,
  petRowToClient,
} from '../src/utils/petProfile.js'

const valid = {
  name: 'Mochi',
  species: 'dog',
  lifeStage: 'adult',
  birthDate: '2021-05-01',
  weight: 12.5,
  neutered: 'yes',
  healthCondition: 'healthy',
  allergies: ['chicken', 'fish'],
}

test('normalizePetProfile accepts a profile the form can produce', () => {
  const res = normalizePetProfile(valid)
  assert.equal(res.ok, true)
  assert.deepEqual(res.value, {
    name: 'Mochi',
    species: 'dog',
    life_stage: 'adult',
    stage_source: 'birthDate',
    birth_date: '2021-05-01',
    weight_kg: 12.5,
    neutered: 'yes',
    health_condition: 'healthy',
    allergies: ['chicken', 'fish'],
  })
})

test('normalizePetProfile trims the name and collapses spaces', () => {
  const res = normalizePetProfile({ ...valid, name: '  Mochi \t  Bear  ' })
  assert.equal(res.value.name, 'Mochi Bear')
})

test('normalizePetProfile rejects a blank or over-long name', () => {
  assert.equal(normalizePetProfile({ ...valid, name: '   ' }).error, MSG.nameRequired)
  assert.equal(normalizePetProfile({ ...valid, name: 'x'.repeat(41) }).error, MSG.nameTooLong)
  assert.equal(normalizePetProfile({ ...valid, name: 5 }).error, MSG.nameRequired)
})

test('normalizePetProfile rejects an unknown species', () => {
  assert.equal(normalizePetProfile({ ...valid, species: 'dragon' }).error, MSG.speciesInvalid)
})

test('normalizePetProfile refuses a stage from another species', () => {
  // "kitten" is a cat stage; a dog cannot be one
  assert.equal(normalizePetProfile({ ...valid, species: 'dog', lifeStage: 'kitten' }).error, MSG.stageInvalid)
  assert.equal(normalizePetProfile({ ...valid, species: 'cat', lifeStage: 'kitten' }).ok, true)
})

test('normalizePetProfile requires a stage', () => {
  assert.equal(normalizePetProfile({ ...valid, lifeStage: '' }).error, MSG.stageRequired)
})

test('normalizePetProfile rejects an unknown condition', () => {
  assert.equal(normalizePetProfile({ ...valid, healthCondition: 'mystery' }).error, MSG.conditionInvalid)
})

test('normalizeAllergies drops "none", dedupes and lowercases', () => {
  assert.deepEqual(normalizeAllergies(['none', 'Chicken', ' chicken ', '']).value, ['chicken'])
  assert.deepEqual(normalizeAllergies(['none']).value, [])
  assert.deepEqual(normalizeAllergies(null).value, [])
  assert.equal(normalizeAllergies(['mystery']).error, MSG.allergyInvalid)
  assert.equal(normalizeAllergies('chicken').error, MSG.allergyInvalid)
})

test('normalizePetProfile accepts a legacy "none" allergy as an empty list', () => {
  const res = normalizePetProfile({ ...valid, allergies: ['none'] })
  assert.equal(res.ok, true)
  assert.deepEqual(res.value.allergies, [])
})

test('normalizeBirthDate accepts a real date and rejects impossible ones', () => {
  assert.equal(normalizeBirthDate('2024-02-29').value, '2024-02-29')
  assert.equal(normalizeBirthDate('2023-02-29').error, MSG.birthInvalid)
  assert.equal(normalizeBirthDate('2024-13-01').error, MSG.birthInvalid)
  assert.equal(normalizeBirthDate('01/02/2024').error, MSG.birthInvalid)
  assert.equal(normalizeBirthDate('').value, null)
})

test('normalizeBirthDate rejects a future date', () => {
  const nextYear = new Date()
  nextYear.setFullYear(nextYear.getFullYear() + 1)
  const text = nextYear.toISOString().slice(0, 10)
  assert.equal(normalizeBirthDate(text).error, MSG.birthFuture)
})

test('normalizePetProfile enforces the weight range', () => {
  assert.equal(normalizePetProfile({ ...valid, weight: 0 }).error, MSG.weightInvalid)
  assert.equal(normalizePetProfile({ ...valid, weight: 250 }).error, MSG.weightInvalid)
  assert.equal(normalizePetProfile({ ...valid, weight: 'heavy' }).error, MSG.weightInvalid)
  assert.equal(normalizePetProfile({ ...valid, weight: 0.1 }).value.weight_kg, 0.1)
  assert.equal(normalizePetProfile({ ...valid, weight: 200 }).value.weight_kg, 200)
  assert.equal(normalizePetProfile({ ...valid, weight: '' }).value.weight_kg, null)
  assert.equal(normalizePetProfile({ ...valid, weight: 12.345 }).value.weight_kg, 12.35)
})

test('normalizePetProfile stores "unknown" neutered for birds and fish', () => {
  const bird = normalizePetProfile({ ...valid, species: 'bird', lifeStage: 'adult', neutered: 'yes' })
  assert.equal(bird.value.neutered, 'unknown')
  const fish = normalizePetProfile({ ...valid, species: 'fish', lifeStage: 'juvenile', neutered: 'no' })
  assert.equal(fish.value.neutered, 'unknown')
  assert.equal(normalizePetProfile({ ...valid, neutered: 'maybe' }).error, MSG.neuteredInvalid)
})

test('normalizePetProfile records a manual stage override without a birth date', () => {
  const res = normalizePetProfile({ ...valid, birthDate: null, stageSource: 'manual' })
  assert.equal(res.value.stage_source, 'manual')
  assert.equal(res.value.birth_date, null)
})

test('normalizePetProfile treats a birth date as the source unless overridden', () => {
  assert.equal(normalizePetProfile({ ...valid }).value.stage_source, 'birthDate')
  assert.equal(
    normalizePetProfile({ ...valid, stageSource: 'manual' }).value.stage_source,
    'manual'
  )
})

test('normalizePetProfile rejects a body that is not an object', () => {
  for (const bad of [null, undefined, 'Mochi', 42, []]) {
    assert.equal(normalizePetProfile(bad).ok, false)
  }
})

test('petRowToClient returns the shape the frontend already uses', () => {
  const row = {
    pet_id: '11111111-1111-4111-8111-111111111111',
    name: 'Mochi',
    species: 'dog',
    life_stage: 'adult',
    stage_source: 'birthDate',
    birth_date: '2021-05-01',
    weight_kg: '12.50',
    neutered: 'yes',
    health_condition: 'healthy',
    allergies: [],
    created_at: '2026-01-01T00:00:00.000Z',
  }
  assert.deepEqual(petRowToClient(row), {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Mochi',
    species: 'dog',
    lifeStage: 'adult',
    stageSource: 'birthDate',
    birthDate: '2021-05-01',
    weight: 12.5,
    neutered: 'yes',
    healthCondition: 'healthy',
    allergies: ['none'],
    createdAt: '2026-01-01T00:00:00.000Z',
  })
})

test('petRowToClient keeps the stored stage and allergies', () => {
  const row = {
    pet_id: 'x', name: 'Mochi', species: 'dog', life_stage: 'puppy', stage_source: 'birthDate',
    birth_date: '2010-01-01', weight_kg: null, neutered: 'unknown', health_condition: 'healthy',
    allergies: ['fish'], created_at: null,
  }
  const pet = petRowToClient(row)
  assert.equal(pet.lifeStage, 'puppy')
  assert.deepEqual(pet.allergies, ['fish'])
  assert.equal(pet.weight, null)
})

test('the pet limit is a small, explicit number', () => {
  assert.equal(Number.isInteger(MAX_PETS), true)
  assert.ok(MAX_PETS > 0 && MAX_PETS <= 50)
})
