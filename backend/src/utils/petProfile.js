// Rules for a pet profile, shared by the pets API and its tests.
//
// The browser form already limits what can be picked, but a request can be
// written by hand, so the server checks everything again. The values here must
// match frontend/src/data/petFormOptions.js: if one list grows, this one has to
// grow with it, otherwise a pet the form accepts would be refused on save.

export const SPECIES = ['dog', 'cat', 'bird', 'fish']

export const LIFE_STAGES = {
  dog: ['puppy', 'adult', 'senior'],
  cat: ['kitten', 'adult', 'senior'],
  bird: ['juvenile', 'adult', 'senior'],
  fish: ['juvenile', 'adult'],
}

// every stage the column accepts, in one list (the CHECK constraint uses this)
export const ALL_STAGES = ['puppy', 'kitten', 'juvenile', 'adult', 'senior']

export const HEALTH_CONDITIONS = [
  'healthy', 'diabetes', 'kidney', 'urinary', 'sensitive-stomach',
  'allergy-prone', 'weight-management', 'dental', 'joint', 'heart', 'liver',
]

export const ALLERGIES = ['chicken', 'beef', 'fish', 'grain', 'dairy', 'egg']

export const NEUTERED = ['unknown', 'yes', 'no']

// species where neutering is a real question (matches the form)
const MAMMALS = ['dog', 'cat']

export const MAX_PETS = 20
export const MAX_NAME = 40
export const MIN_WEIGHT = 0.1
export const MAX_WEIGHT = 200

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

export const MSG = {
  nameRequired: 'Please enter a name for your pet.',
  nameTooLong: `A pet name can be at most ${MAX_NAME} characters.`,
  speciesInvalid: 'Please choose dog, cat, bird or fish.',
  stageInvalid: 'Please choose a life stage that fits this species.',
  stageRequired: 'Please choose a life stage.',
  conditionInvalid: 'That health condition is not one we recognise.',
  allergyInvalid: 'That allergy is not one we recognise.',
  birthInvalid: 'Please enter a valid date of birth.',
  birthFuture: 'The date of birth cannot be in the future.',
  weightInvalid: `Weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT} kg.`,
  neuteredInvalid: 'Please choose whether the pet is neutered.',
  tooManyPets: `You can keep up to ${MAX_PETS} pets on one account.`,
  notFound: 'That pet could not be found. Refresh the page and try again.',
}

// ISO date (YYYY-MM-DD) -> the same string, or null when the shape or the
// calendar date is wrong. A bare date avoids timezone drift, which is what the
// browser form stores too.
export function normalizeBirthDate(value) {
  if (value == null || value === '') return { ok: true, value: null, error: null }
  if (typeof value !== 'string') return { ok: false, value: null, error: MSG.birthInvalid }
  const text = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return { ok: false, value: null, error: MSG.birthInvalid }
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return { ok: false, value: null, error: MSG.birthInvalid }
  }
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  if (date.getTime() > todayUtc) {
    return { ok: false, value: null, error: MSG.birthFuture }
  }
  return { ok: true, value: text, error: null }
}

export function normalizeName(raw) {
  if (typeof raw !== 'string') return { ok: false, value: null, error: MSG.nameRequired }
  const name = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (!name) return { ok: false, value: null, error: MSG.nameRequired }
  if (name.length > MAX_NAME) return { ok: false, value: null, error: MSG.nameTooLong }
  return { ok: true, value: name, error: null }
}

// "none" means no allergy, and it never travels with a real one: an older form
// allowed both, and the engine treats the pair as "just the real ones". The
// API stores the empty list instead, so the column stays honest.
export function normalizeAllergies(raw) {
  if (raw == null) return { ok: true, value: [], error: null }
  if (!Array.isArray(raw)) return { ok: false, value: null, error: MSG.allergyInvalid }
  const cleaned = []
  for (const entry of raw) {
    if (entry == null) continue
    if (typeof entry !== 'string') return { ok: false, value: null, error: MSG.allergyInvalid }
    const value = entry.trim().toLowerCase()
    if (!value || value === 'none') continue
    if (!ALLERGIES.includes(value)) return { ok: false, value: null, error: MSG.allergyInvalid }
    if (!cleaned.includes(value)) cleaned.push(value)
  }
  return { ok: true, value: cleaned, error: null }
}

// returns { ok, value, error } where value is the exact row to write
export function normalizePetProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, value: null, error: MSG.nameRequired }
  }

  const name = normalizeName(raw.name)
  if (!name.ok) return name

  const species = typeof raw.species === 'string' ? raw.species.trim().toLowerCase() : ''
  if (!SPECIES.includes(species)) return { ok: false, value: null, error: MSG.speciesInvalid }

  const lifeStage = typeof raw.lifeStage === 'string' ? raw.lifeStage.trim().toLowerCase() : ''
  if (!lifeStage) return { ok: false, value: null, error: MSG.stageRequired }
  if (!(LIFE_STAGES[species] || []).includes(lifeStage)) {
    return { ok: false, value: null, error: MSG.stageInvalid }
  }

  const birthDate = normalizeBirthDate(raw.birthDate ?? null)
  if (!birthDate.ok) return birthDate

  const condition = typeof raw.healthCondition === 'string'
    ? raw.healthCondition.trim().toLowerCase()
    : 'healthy'
  if (!HEALTH_CONDITIONS.includes(condition)) {
    return { ok: false, value: null, error: MSG.conditionInvalid }
  }

  const allergies = normalizeAllergies(raw.allergies)
  if (!allergies.ok) return allergies

  let weight = raw.weight
  if (weight === '' || weight == null) weight = null
  if (weight !== null) {
    weight = Number(weight)
    if (!Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      return { ok: false, value: null, error: MSG.weightInvalid }
    }
    weight = Math.round(weight * 100) / 100
  }

  // the form only asks mammals, and any other species stores "unknown"
  let neutered = typeof raw.neutered === 'string' ? raw.neutered.trim().toLowerCase() : 'unknown'
  if (!NEUTERED.includes(neutered)) {
    return { ok: false, value: null, error: MSG.neuteredInvalid }
  }
  if (!MAMMALS.includes(species)) neutered = 'unknown'

  // a date of birth is the source of truth when it is present; the form marks
  // an override as "manual" and keeps the stage the owner chose
  const stageSource =
    raw.stageSource === 'manual'
      ? 'manual'
      : birthDate.value
        ? 'birthDate'
        : 'manual'

  return {
    ok: true,
    value: {
      name: name.value,
      species,
      life_stage: lifeStage,
      stage_source: stageSource,
      birth_date: birthDate.value,
      weight_kg: weight,
      neutered,
      health_condition: condition,
      allergies: allergies.value,
    },
    error: null,
  }
}

// row -> the shape the frontend already uses for a pet profile, so the context
// keeps its interface and the components do not change. The stored stage is
// returned as it was saved; the browser refreshes it from the birth date on load
// (withCurrentLifeStage in frontend/src/lib/petAge.js), so there is one place
// that decides what "senior" means today.
export function petRowToClient(row) {
  return {
    id: row.pet_id,
    name: row.name,
    species: row.species,
    lifeStage: row.life_stage,
    stageSource: row.stage_source,
    birthDate: row.birth_date || null,
    weight: row.weight_kg == null ? null : Number(row.weight_kg),
    neutered: row.neutered || 'unknown',
    healthCondition: row.health_condition || 'healthy',
    allergies: Array.isArray(row.allergies) && row.allergies.length > 0 ? row.allergies : ['none'],
    createdAt: row.created_at || null,
  }
}
