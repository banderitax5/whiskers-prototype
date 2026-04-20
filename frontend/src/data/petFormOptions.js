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

export const ALLERGY_OPTIONS = [
  { value: 'none', label: 'None / Not sure' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'beef', label: 'Beef' },
  { value: 'fish', label: 'Fish / Seafood' },
  { value: 'grain', label: 'Grain / Wheat' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'egg', label: 'Egg' },
]

export function getLifeStageOptions(species) {
  return LIFE_STAGE_OPTIONS[species] || []
}

export function findLabel(options, value) {
  const match = options.find((opt) => opt.value === value)
  return match ? match.label : value
}
