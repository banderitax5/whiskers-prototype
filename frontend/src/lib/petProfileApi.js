// Maps a pet profile between the shape the React app uses (camelCase,
// `lifeStage`) and the shape the backend API accepts (the same fields with
// `lifeStage` kept, because the server does the snake_case mapping itself).
//
// Only the fields a profile owns are sent. `id`, `createdAt` and anything else
// the browser added stay local, so the server never receives a value it would
// have to ignore.

const ALLERGY_CODES = ['chicken', 'beef', 'lamb', 'fish', 'grain', 'dairy', 'egg']

// The answers to the daily-life questions. An old profile, or a browser whose
// storage was edited by hand, can hold anything: an unknown value is replaced
// with the neutral answer so the server never refuses the whole profile.
export const ACTIVITY_CODES = ['low', 'normal', 'high']
export const ENVIRONMENT_CODES = ['indoor', 'outdoor', 'both']
export const BREED_SIZE_CODES = ['small', 'medium', 'large', 'unknown']

function cleanCode(value, allowed, fallback) {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return allowed.includes(code) ? code : fallback
}

// "none" is not an allergen: the API stores an empty list, which is what the
// column accepts. Anything unknown is dropped here too, because the server would
// reject the whole profile for one bad value.
export function toServerAllergies(allergies) {
  const list = Array.isArray(allergies) ? allergies : []
  const out = []
  for (const value of list) {
    if (typeof value !== 'string') continue
    const code = value.trim().toLowerCase()
    if (!code || code === 'none' || code === 'not sure') continue
    if (!ALLERGY_CODES.includes(code)) continue
    if (!out.includes(code)) out.push(code)
  }
  return out
}

export function toServerPet(pet) {
  return {
    name: pet.name,
    species: pet.species,
    lifeStage: pet.lifeStage,
    stageSource: pet.stageSource === 'manual' ? 'manual' : 'birthDate',
    birthDate: pet.birthDate || null,
    weight: pet.weight == null || pet.weight === '' ? null : Number(pet.weight),
    neutered: pet.neutered || 'unknown',
    healthCondition: pet.healthCondition || 'healthy',
    allergies: toServerAllergies(pet.allergies),
    // the daily-life answers are only meaningful for the species that shows the
    // questions; anything else is sent as the neutral answer
    activity: pet.species === 'dog' || pet.species === 'cat'
      ? cleanCode(pet.activity, ACTIVITY_CODES, 'normal')
      : 'normal',
    environment: pet.species === 'cat'
      ? cleanCode(pet.environment, ENVIRONMENT_CODES, 'both')
      : 'both',
    breedSize: pet.species === 'dog'
      ? cleanCode(pet.breedSize, BREED_SIZE_CODES, 'unknown')
      : 'unknown',
  }
}
