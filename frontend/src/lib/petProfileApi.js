// Maps a pet profile between the shape the React app uses (camelCase,
// `lifeStage`) and the shape the backend API accepts (the same fields with
// `lifeStage` kept, because the server does the snake_case mapping itself).
//
// Only the fields a profile owns are sent. `id`, `createdAt` and anything else
// the browser added stay local, so the server never receives a value it would
// have to ignore.

const ALLERGY_CODES = ['chicken', 'beef', 'fish', 'grain', 'dairy', 'egg']

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
  }
}
