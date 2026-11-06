// centralized dropdown options for the pet profile form
// keeping these in one place prevents typos and mismatches
// between what the form accepts and what the recommendation engine expects

export const SPECIES_OPTIONS = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'fish', label: 'Fish' },
]

export const LIFE_STAGE_OPTIONS = {
  dog: [
    { value: 'puppy', label: 'Puppy (under 12 months)' },
    { value: 'adult', label: 'Adult (1 - 7 years)' },
    { value: 'senior', label: 'Senior (7+ years)' },
  ],
  cat: [
    { value: 'kitten', label: 'Kitten (under 12 months)' },
    { value: 'adult', label: 'Adult (1 - 10 years)' },
    { value: 'senior', label: 'Senior (10+ years)' },
  ],
  bird: [
    { value: 'juvenile', label: 'Juvenile (under 1 year)' },
    { value: 'adult', label: 'Adult' },
    { value: 'senior', label: 'Senior' },
  ],
  fish: [
    { value: 'juvenile', label: 'Juvenile (young/fry)' },
    { value: 'adult', label: 'Adult' },
  ],
}

export const HEALTH_CONDITION_OPTIONS = [
  { value: 'healthy', label: 'Healthy - no known conditions' },
  { value: 'diabetes', label: 'Diabetes / Blood Sugar Issues' },
  { value: 'kidney', label: 'Kidney Disease' },
  { value: 'urinary', label: 'Urinary Tract / Bladder Issues' },
  { value: 'sensitive-stomach', label: 'Sensitive Stomach / Digestive Issues' },
  { value: 'allergy-prone', label: 'Allergy-Prone / Skin Issues' },
  { value: 'weight-management', label: 'Overweight / Weight Management' },
  { value: 'dental', label: 'Dental / Oral Health Problems' },
  { value: 'joint', label: 'Joint / Mobility Issues (Arthritis, Hip Dysplasia)' },
  { value: 'heart', label: 'Heart Condition' },
  { value: 'liver', label: 'Liver Issues' },
]

// neutered status is asked for dogs and cats only; "unknown" is the default so
// nobody has to guess before saving
export const NEUTERED_OPTIONS = [
  { value: 'unknown', label: 'Not sure' },
  { value: 'yes', label: 'Yes - neutered / spayed' },
  { value: 'no', label: 'No' },
]

export const ALLERGY_OPTIONS = [
  { value: 'none', label: 'None / Not sure' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'beef', label: 'Beef' },
  { value: 'lamb', label: 'Lamb' },
  { value: 'fish', label: 'Fish / Seafood' },
  { value: 'grain', label: 'Grain / Wheat' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'egg', label: 'Egg' },
]

// A stored profile can hold a value the form no longer offers, either because it
// was saved by an older build or because somebody edited this browser's storage.
// These are the same allergen under another name, so they are folded into the
// value the engine and the form both understand. Only pairs that mean exactly
// the same thing are listed - "rice" is deliberately not mapped to "grain".
const ALLERGY_ALIASES = {
  wheat: 'grain',
  grains: 'grain',
  cereals: 'grain',
  seafood: 'fish',
  'fish-meal': 'fish',
  poultry: 'chicken',
  milk: 'dairy',
  eggs: 'egg',
}

// "sensitive-stomach" -> "Sensitive stomach": a value with no matching option
// still has to read like words, never like a raw code
function humanize(value) {
  if (typeof value !== 'string') return value
  const words = value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return value
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function getLifeStageOptions(species) {
  return LIFE_STAGE_OPTIONS[species] || []
}

// the form value for a stored allergy, so an older "wheat" still checks the
// "Grain / Wheat" box and still filters grain products out of the results. A
// saved label ("Fish / Seafood") is accepted too, in case an older copy stored
// the readable text instead of the value.
export function canonicalAllergy(value) {
  if (typeof value !== 'string') return value
  const key = value.trim().toLowerCase()
  if (!key) return ''
  if (ALLERGY_ALIASES[key]) return ALLERGY_ALIASES[key]
  const byLabel = ALLERGY_OPTIONS.find((opt) => opt.label.toLowerCase() === key)
  return byLabel ? byLabel.value : key
}

// readable labels for a saved allergy list: 'none' dropped (in any spelling),
// aliases resolved, duplicates removed, unknown values humanized instead of
// printed as a code
export function allergyLabels(allergies) {
  const list = Array.isArray(allergies) ? allergies : []
  const seen = new Set()
  const labels = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const value = canonicalAllergy(raw)
    if (!value || value === 'none' || seen.has(value)) continue
    seen.add(value)
    labels.push(findLabel(ALLERGY_OPTIONS, value))
  }
  return labels
}

export function findLabel(options, value) {
  const match = options.find((opt) => opt.value === value)
  return match ? match.label : humanize(value)
}

// dropdown labels carry the age range in brackets, which is noise on a summary
// line: "Dog · Adult · 2 years 8 months old" reads better than
// "Dog · Adult (1 - 7 years) · 2 years 8 months old"
export function findShortLabel(options, value) {
  const label = findLabel(options, value)
  return typeof label === 'string' ? label.replace(/\s*\([^)]*\)\s*$/, '') : label
}
