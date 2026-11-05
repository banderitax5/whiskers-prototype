// Age helpers for the pet profile.
//
// Asking for a birth date is friendlier than asking for a life stage: the stage
// the owner picks today is wrong in a year, while a date of birth stays true and
// the stage can be worked out again on every visit.
//
// The boundaries mirror the labels in data/petFormOptions.js (dog puppy under
// 12 months, senior from 7 years, and so on). A test keeps the two in step.
//
// Everything here is pure, so the form, the pet card and the tests all read the
// same rules.

const MS_PER_DAY = 86_400_000

// stage -> last age (in months) that still counts as that stage, per species.
// The final entry is open ended. Boundaries are "under", so exactly 12 months
// is already an adult.
export const STAGE_AGE_RULES = {
  dog: [
    { stage: 'puppy', maxMonths: 12 },
    { stage: 'adult', maxMonths: 84 },
    { stage: 'senior', maxMonths: Infinity },
  ],
  cat: [
    { stage: 'kitten', maxMonths: 12 },
    { stage: 'adult', maxMonths: 120 },
    { stage: 'senior', maxMonths: Infinity },
  ],
  bird: [
    { stage: 'juvenile', maxMonths: 12 },
    { stage: 'adult', maxMonths: 60 },
    { stage: 'senior', maxMonths: Infinity },
  ],
  fish: [
    { stage: 'juvenile', maxMonths: 6 },
    { stage: 'adult', maxMonths: Infinity },
  ],
}

// "YYYY-MM-DD" -> a local Date at midnight. new Date('2020-01-31') would be
// parsed as UTC midnight, which is still January in Manila but the previous day
// in the Americas, so the date parts are read by hand to avoid the drift.
export function parseDateInput(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  }
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) {
    if (!trimmed) return null
    const fallback = new Date(trimmed)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  // rejects impossible dates such as 2024-02-31, which JS would roll over
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

// whole months between two dates; null when either date is unusable or the
// second one is earlier than the first (a birth date in the future)
export function monthsBetween(from, to) {
  const start = parseDateInput(from)
  const end = to instanceof Date ? to : parseDateInput(to)
  if (!start || !end || end.getTime() < start.getTime()) return null

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  // the day has not come round yet this month, so the last month is not full
  if (end.getDate() < start.getDate()) months -= 1
  return Math.max(0, months)
}

// the life stage for a species at a given age, or null when it cannot be
// worked out (no species, no usable birth date, or a future date)
export function computeLifeStage(species, birthDate, now = new Date()) {
  const rules = STAGE_AGE_RULES[species]
  if (!rules) return null

  const months = monthsBetween(birthDate, now)
  if (months === null) return null

  const row = rules.find((rule) => months < rule.maxMonths)
  return row ? row.stage : rules[rules.length - 1].stage
}

// "8 months", "2 years", "2 years 3 months" - for the pet card
export function formatAge(birthDate, now = new Date()) {
  const months = monthsBetween(birthDate, now)
  if (months === null) return null
  if (months < 1) return 'less than a month'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`

  const years = Math.floor(months / 12)
  const rest = months % 12
  const yearText = `${years} year${years === 1 ? '' : 's'}`
  if (rest === 0) return yearText
  return `${yearText} ${rest} month${rest === 1 ? '' : 's'}`
}

// today in the same "YYYY-MM-DD" shape the date input uses (local, not UTC)
export function todayInputValue(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// days in a date, kept next to the helpers in case a future rule needs it
export function daysBetween(from, to) {
  const start = parseDateInput(from)
  const end = to instanceof Date ? to : parseDateInput(to)
  if (!start || !end) return null
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
}

// A profile saved a year ago can still say "puppy". When the stage came from the
// birth date it is worked out again on the way in, so the pet card and the food
// recommendations keep up with the pet's age without an edit. An owner who
// picked the stage by hand keeps it, and pets saved before birth dates existed
// have no date, so they are returned untouched.
export function withCurrentLifeStage(pet, now = new Date()) {
  if (!pet || !pet.birthDate || pet.stageSource === 'manual') return pet
  const stage = computeLifeStage(pet.species, pet.birthDate, now)
  if (!stage || stage === pet.lifeStage) return pet
  return { ...pet, lifeStage: stage }
}
