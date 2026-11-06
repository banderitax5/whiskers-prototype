// Rule-based recommendation engine over the live store catalog.
// The product table has no structured species, health, or allergen fields, so
// profiles are derived from category, name, brand, and description text. Only
// priced, in-stock rows are recommendable because every result must be
// purchasable.
//
// evaluate(pet, products) applies these rules in order. A product that fails a
// rule is kept in `excluded` with the rule's name, so every result can be
// explained and tested:
//   1. unavailable - inactive, unpriced, out of stock, or test rows
//   2. non-food    - litter, shampoo and similar rows filed under a pet category
//   3. species     - not for this species (hard exclude)
//   4. lifeStage   - every pet only gets products for its own stage or for
//                    every stage (hard exclude)
//   5. allergen    - product text names an allergen the pet has (hard exclude)
//   6. therapeutic - condition-specific products only for a pet whose condition
//                    matches one of their tags (hard exclude)
//   7. score       - life stage, one condition match (never one per tag), a
//                    healthy baseline, and an allergy-friendly boost. Products
//                    that match the pet's condition go in `best`; other eligible
//                    products go in `other` and are labelled as general foods.
//   8. daily life  - activity, indoor/outdoor and breed size only change the
//                    order (soft score) and the reason lines. They never hide a
//                    product except through the existing breed-size rule.
//
// Ties are broken by price (low first), then name, then id, so the same input
// always gives the same order.

// The allergy names come from the same list the pet form shows, so a stored
// value and its label can never drift apart. canonicalAllergy() also folds an
// older name ("wheat") onto today's one ("grain") before any filtering happens.
import { ALLERGY_OPTIONS, canonicalAllergy, findLabel } from '../data/petFormOptions'

const SPECIES_BY_CATEGORY = [
  { match: (c) => c.startsWith('dogs'), species: ['dog'] },
  { match: (c) => c.startsWith('cats'), species: ['cat'] },
  { match: (c) => c === 'birds', species: ['bird'] },
  { match: (c) => c === 'fish', species: ['fish'] },
  { match: (c) => c === 'pets milk', species: ['dog', 'cat'] },
]

// condition -> health tags that count as a match (same mapping the original
// curated engine used, plus a skin tag derived from "Hair and Skin" products)
const CONDITION_TAGS = {
  diabetes: ['diabetes-safe'],
  kidney: ['kidney-safe', 'urinary-support'],
  urinary: ['urinary-support'],
  'sensitive-stomach': ['sensitive-stomach'],
  'weight-management': ['weight-management'],
  dental: ['dental'],
  joint: ['joint-support'],
  heart: ['heart-support'],
  liver: ['liver-support'],
  'allergy-prone': ['allergy-friendly', 'skin-coat'],
}

const CONDITION_PHRASE = {
  diabetes: 'blood sugar management',
  kidney: 'kidney support',
  urinary: 'urinary tract support',
  'sensitive-stomach': 'digestive health',
  'weight-management': 'weight management',
  dental: 'dental health',
  joint: 'joint and mobility support',
  heart: 'heart health',
  liver: 'liver health',
  'allergy-prone': 'skin and allergy support',
}

// Tags that describe a recipe rather than a medical need. A product with only
// these tags is not gated as therapeutic. PENDING EXPERT REVIEW.
const RECIPE_TAGS = ['allergy-friendly', 'skin-coat']

// Every other condition tag marks a product as therapeutic: it is only shown to
// a pet whose condition matches one of its tags. PENDING EXPERT REVIEW.
const THERAPEUTIC_TAGS = new Set(
  Object.values(CONDITION_TAGS).flat().filter((tag) => !RECIPE_TAGS.includes(tag))
)

const TAG_KEYWORDS = [
  { tag: 'kidney-safe', words: ['renal', 'kidney'] },
  { tag: 'urinary-support', words: ['urinary', 'bladder', 'struvite', 'urolith', 'oxalate', 'crystal'] },
  // Only the words a therapeutic diet uses. "Chicken With Hearts" and "Beef &
  // Liver" are ingredients on an ordinary food, and tagging those as therapy put
  // them at the top of a sick pet's list, so the bare organ word is not used.
  { tag: 'heart-support', words: ['cardiac', 'heart care', 'heart health', 'heart support', 'heart nutrition'] },
  { tag: 'liver-support', words: ['hepatic', 'liver care', 'liver health', 'liver support', 'liver diet'] },
  { tag: 'sensitive-stomach', words: ['gastrointestinal', 'gastro', 'digestive', 'sensitive'] },
  { tag: 'allergy-friendly', words: ['hypoallergenic', 'allergen'] },
  { tag: 'weight-management', words: ['satiety', 'weight', 'obesity', 'low cal'] },
  { tag: 'skin-coat', words: ['hair', 'skin', 'derma'] },
  { tag: 'dental', words: ['dental', 'teeth', 'oral'] },
  { tag: 'diabetes-safe', words: ['diabetes', 'diabetic'] },
  { tag: 'joint-support', words: ['glucosamine', 'mobility', 'joint', 'arthritis'] },
  { tag: 'recovery-support', words: ['recovery', 'critical', 'intensive'] },
  { tag: 'growth-support', words: ['puppy', 'kitten', 'baby', 'junior', 'growth'] },
]

// A product name that says "VD" (veterinary diet), "VT" or "prescription" is a
// vet-only food even when no condition word is in the name. Without a matching
// condition there is nothing to match it to, so it stays hidden for a healthy pet.
// "Mr Vet" is a normal brand name, so a bare "vet" does not count. PENDING EXPERT REVIEW.
const VET_DIET_RE = /\bvd\b|\bvt\b|\bveterinary\b|\bprescription\b|\btherapeutic\b/i

// Allergen group (the same names as the form's allergy options) -> words that
// name it in product text. Only unambiguous names are listed. Rice is left out of
// "grain" on purpose until the expert review decides. PENDING EXPERT REVIEW.
// Philippine store names shorten ingredients ("CKN", "BF") and use local fish
// words, so those forms are listed too - a missed synonym is a safety bug.
const ALLERGEN_TERMS = {
  chicken: ['chicken', 'ckn', 'chkn', 'chik', 'poultry'],
  beef: ['beef', 'bf', 'veal', 'bovine'],
  lamb: ['lamb', 'mutton'],
  fish: [
    'fish', 'oceanfish', 'fishmeal', 'fishball', 'fishcake', 'catfish', 'milkfish',
    'whitefish', 'swordfish', 'shellfish', 'salmon', 'tuna', 'sardine', 'anchovy',
    'anchovies', 'mackerel', 'herring', 'shrimp', 'prawn', 'squid', 'seafood', 'cod',
    'haddock', 'pollock', 'tilapia', 'trout', 'dory', 'basa', 'bonito', 'katsuo',
    'maguro', 'krill', 'crab', 'lobster', 'oyster', 'mussel', 'clam', 'scallop',
    'octopus', 'calamari', 'bangus', 'galunggong', 'tamban', 'crabstick', 'surimi',
    'marine',
  ],
  grain: ['wheat', 'barley', 'rye', 'oats', 'oatmeal'],
  dairy: ['dairy', 'milk', 'cheese', 'whey', 'yogurt', 'yoghurt', 'butter', 'cream'],
  egg: ['egg'],
}

// every life stage the pet form can save (see LIFE_STAGE_OPTIONS)
const KNOWN_STAGES = ['puppy', 'kitten', 'juvenile', 'adult', 'senior']
// stages where a food must name its stage, not just suit the species
const GROWTH_STAGES = ['puppy', 'kitten', 'juvenile']

const ALL_STAGES = {
  dog: ['puppy', 'adult', 'senior'],
  cat: ['kitten', 'adult', 'senior'],
  bird: ['juvenile', 'adult', 'senior'],
  fish: ['juvenile', 'adult'],
}

// A pet with a condition can be shown general foods when no formula matches.
// "available" covers both cases - none made for that condition, or all of them
// out of stock - so the card never claims a formula exists when it does not.
const GENERAL_FORMULA_REASON = 'General formula - no condition-specific match available'
const LABEL_CHECK_WARNING = 'Check the label: ingredients are not listed in our catalog.'
const LABEL_CHECK_NOTICE = 'Our catalog does not list full ingredients. Always check the product label for allergens.'

// Rows filed under a pet category that are not food (litter, shampoo, chews that
// are really toothbrushes). Recommending a bag of litter as dinner is the worst
// kind of wrong, so these are refused before any scoring happens.
const NON_FOOD_RE = /\blitter\b|\bbentonite\b|\btofu\b|cat sand|\bsand\b|scratcher|clumping|deodorizer|toothbrush|shampoo|\bsoap\b|\bspray\b|\bcollar\b|\bharness\b|\bleash\b|\bbowl\b|feeder|fountain|\btoy\b|\bpads?\b|\bwipe\b|\bdiaper\b|training pad|cat grass/i
// A food name never says how many litres it holds; cat litter always does.
const LITRE_RE = /\b\d+(?:\.\d+)?\s*l\b/i

// Treats and toppers are not a complete meal, so they are shown lower than real
// food and never carry the TOP MATCH badge. "Small Bites" is a kibble size, not
// a treat, so the words are specific.
const TREAT_RE = /\btreats?\b|\bpuree\b|\bcreamy\b|\bchews?\b|\bsticks?\b|\bstix\b|\bbiscuits?\b|\bjerky\b|\bdentastix\b|\bsnack\b|\breward\b|\btopper\b/i

// Breed-size words. "Small Bites" is deliberately not matched: that is the size
// of the kibble, not the size of the dog.
const SIZE_CLASSES = [
  { size: 'small', re: /\bmini\b|\btoy\b|\bsmall\s+(?:breed|dog)\b/i },
  { size: 'medium', re: /\bmedium\s+(?:breed|dog)\b/i },
  { size: 'large', re: /\blarge\s+(?:breed|dog)\b|\bbig\s+dog\b|\bgiant\b|\bmaxi\b/i },
]

// A dog's weight decides which breed-size food is right. The bands are broad on
// purpose: the catalog only labels a product "small/medium/large", so a 9 kg dog
// and a 7 kg dog are both "small".
export function sizeClassForWeight(weightKg) {
  const kg = Number(weightKg)
  if (!Number.isFinite(kg) || kg <= 0) return null
  if (kg <= 10) return 'small'
  if (kg <= 25) return 'medium'
  return 'large'
}

// The breed-size line for one dog. The owner's own answer wins, because it is
// the only thing that knows a puppy's adult size. Without an answer, a grown
// dog's weight decides; a puppy's current weight says nothing about the adult
// size, so a puppy keeps every size instead of being classed by today's kilos.
const BREED_SIZES = ['small', 'medium', 'large']

export function petSizeClass(pet, stage) {
  if (!pet || pet.species !== 'dog') return null
  const explicit = typeof pet.breedSize === 'string' ? pet.breedSize.trim().toLowerCase() : ''
  if (BREED_SIZES.includes(explicit)) return explicit
  if (GROWTH_STAGES.includes(stage)) return null
  return sizeClassForWeight(pet.weight)
}

// Daily-life words. They describe what the formula is (energy dense, light,
// indoor, hairball) and never a health claim. "ProActive" is one word, so the
// word boundaries keep it from counting as "active".
const ENERGY_RE = /\bhigh[\s-]*energy\b|\bperformance\b|\bactive\b|\bsport\b|\bworking\b|\bagility\b|\bendurance\b/i
const LIGHT_RE = /\blight\b|\blite\b|low[\s-]*fat|low[\s-]*calorie|reduced[\s-]*calorie|\bsatiety\b/i
const INDOOR_RE = /\bindoor\b/i
const HAIRBALL_RE = /\bhairball\b/i

// a product the engine wants to flag as a poor fit for a calm pet
const LOW_ACTIVITY_WARNING = 'High-energy formula, but your pet has low activity.'

export function dietSizeClass(product) {
  const name = product.prod_name || ''
  const hit = SIZE_CLASSES.find(({ re }) => re.test(name))
  return hit ? hit.size : null
}

function isTreat(product) {
  return TREAT_RE.test(product.prod_name || '')
}

// a whole word, allowing a plural "s" or "es" (kidneys, eggs, allergens)
function wordPattern(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`)
}

const TAG_PATTERNS = TAG_KEYWORDS.map(({ tag, words }) => ({
  tag,
  patterns: words.map(wordPattern),
}))
// A species word in the product name can contradict the category ("Moochie
// Casserole Dog Food" filed under Cats). The category is the supplier's own
// filing, but the name is what a shopper reads, so a name that says dog on a
// cat row is refused instead of guessed.
const DOG_NAME_RE = /\bdog\b|\bdogs\b|\bpuppy\b|\bpuppies\b/i
const CAT_NAME_RE = /\bcat\b|\bcats\b|\bkitten\b|\bkittens\b/i
const ALLERGEN_PATTERNS = Object.entries(ALLERGEN_TERMS).map(([group, words]) => ({
  group,
  patterns: words.map(wordPattern),
}))

export function speciesFor(category) {
  const c = (category || '').toLowerCase()
  const row = SPECIES_BY_CATEGORY.find((r) => r.match(c))
  return row ? row.species : []
}

// Life-stage words suppliers put in product names. The stage always stands on
// its own (space, dash or slash either side), so brand and weight around it do
// not matter: "Royal Canin Medium Puppy 4kg" -> puppy.
//   - junior, baby, growth -> the growth stage of this species
//   - All Stages / All Life Stages -> every stage of the species
//   - "Adult 7+" style age markers -> senior
const ALL_STAGES_RE = /\ball[\s-]*(?:life[\s-]*)?stages?\b|\bany[\s-]*stages?\b|\bevery[\s-]*stages?\b|\ball[\s-]*ages?\b/
const AGE_PLUS_RE = /\b(\d{1,2})\s*\+/
const SENIOR_AGE = 7

// one canonical order, so the same name always produces the same list
const STAGE_ORDER = ['puppy', 'kitten', 'juvenile', 'adult', 'senior']

// "junior", "baby" and "growth" name the growth stage of the species
function growthStageFor(species) {
  if (species.includes('cat')) return 'kitten'
  if (species.includes('dog')) return 'puppy'
  return 'juvenile'
}

export function deriveProfile(product) {
  const haystack = `${product.prod_name || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase()
  const species = speciesFor(product.category)

  const stages = new Set()
  if (/\b(puppy|puppies)\b/.test(haystack)) stages.add('puppy')
  if (/\b(kitten|kittens|babycat)\b/.test(haystack)) stages.add('kitten')
  // "junior", "baby" and "growth" name the growth stage: puppy, kitten or juvenile
  if (/\b(junior|baby|growth)\b/.test(haystack)) stages.add(growthStageFor(species))
  if (/\b(senior|geriatric|mature)\b/.test(haystack)) stages.add('senior')
  if (/\badult\b/.test(haystack)) stages.add('adult')
  // "Adult 7+", "Senior 11+": an age marker from 7 up is a senior formula
  const agePlus = haystack.match(AGE_PLUS_RE)
  if (agePlus && Number(agePlus[1]) >= SENIOR_AGE) stages.add('senior')

  // "All Stages" / "All Life Stages" states a stage in the name, so it counts
  // as explicit and passes the growth-stage rule
  const allStages = ALL_STAGES_RE.test(haystack)
  const named = stages.size > 0
  // products with no stage marker, and all-stages products, suit every stage
  if (!named && species.length > 0) {
    for (const s of species) {
      for (const stage of ALL_STAGES[s] || []) stages.add(stage)
    }
  }
  // "All Stages" states a stage, so it passes the growth-stage rule...
  const stageExplicit = named || allStages
  // ...but only a name that names one stage is built for that stage
  const stageSpecific = named
  const lifeStage = STAGE_ORDER.filter((stage) => stages.has(stage))

  // the description also feeds the health keywords (e.g. "for sensitive stomachs")
  const healthText = `${haystack} ${(product.description || '').toLowerCase()}`
  const healthTags = ['healthy']
  for (const { tag, patterns } of TAG_PATTERNS) {
    if (patterns.some((p) => p.test(healthText))) healthTags.push(tag)
  }

  return { species, lifeStage, healthTags, stageExplicit, stageSpecific }
}

// true when the product name names a different species than its category says.
// A row filed under Cats that says "Dog Food" is a filing mistake, and showing
// it to either animal is a wrong recommendation. Unknown species (birds, fish,
// small pets) are left alone: those names rarely carry the species word.
export function speciesMismatch(product) {
  const name = product.prod_name || ''
  const category = (product.category || '').toLowerCase()
  const filedUnderCats = category.startsWith('cats')
  const filedUnderDogs = category.startsWith('dogs')
  if (filedUnderCats && DOG_NAME_RE.test(name) && !CAT_NAME_RE.test(name)) return true
  if (filedUnderDogs && CAT_NAME_RE.test(name) && !DOG_NAME_RE.test(name)) return true
  return false
}

// Allergen groups named in a product's text (name, brand, description). The
// catalog has no ingredient list yet, so this is a best-effort check and the
// results carry a "check the label" warning.
export function allergensFor(product) {
  const text = `${product.prod_name || ''} ${product.brand || ''} ${product.description || ''}`.toLowerCase()
  return ALLERGEN_PATTERNS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(({ group }) => group)
}

// 'none' means no allergy. It is ignored when other allergies are listed too,
// so ['none', 'chicken'] behaves exactly like ['chicken']. An older stored name
// ("wheat", "seafood") is folded onto today's value before the rules run, so the
// pet is protected exactly as if the profile had been saved today.
function activeAllergies(pet) {
  const list = Array.isArray(pet.allergies) ? pet.allergies : []
  // canonicalize first, so an older "None" (any capitalisation) is still read as
  // "no allergy" and never becomes an unknown-allergy notice
  const values = list
    .filter((a) => typeof a === 'string' && a.trim())
    .map((a) => canonicalAllergy(a))
    .filter((a) => a && a !== 'none')
  return [...new Set(values)]
}

function unavailableReason(product) {
  if (product.is_active === false) return 'Listing is inactive'
  if (!(Number(product.price) > 0)) return 'No price set'
  if (Number(product.stock_quantity || 0) <= 0) return 'Out of stock'
  if ((product.category || '').toLowerCase() === 'test') return 'Test listing'
  return null
}

// a bag of litter or a bottle of shampoo filed under "Cats" is not dinner. Pet
// milk is the one food sold by the litre, so the volume clue skips it.
function isNonFood(product) {
  const name = product.prod_name || ''
  if (NON_FOOD_RE.test(name)) return true
  return LITRE_RE.test(name) && !/\bmilk\b/i.test(name)
}

function compareText(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// higher score first, then lower price, then name, then id
function byRank(a, b) {
  return (
    b.score - a.score ||
    a.price - b.price ||
    compareText(a.name, b.name) ||
    compareText(String(a.id), String(b.id))
  )
}

// The calm/active answer for a pet that was saved before these questions
// existed, or with a value we do not know.
export function normalizeActivity(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ['low', 'normal', 'high'].includes(text) ? text : 'normal'
}

// Returns { best, other, excluded, notices, matchedCondition }.
// best: products that match the pet's condition (or every eligible product when
//       the pet has no condition).
// other: general foods shown only when the pet has a condition but no product
//        matches it. Each one is labelled as a general formula.
// excluded: { id, name, rule, reason } for every product that was not shown.
export function evaluate(pet, products) {
  const result = { best: [], other: [], excluded: [], notices: [], matchedCondition: false }
  if (!pet || !pet.species) return result

  const allergies = activeAllergies(pet)
  const condition = pet.healthCondition && pet.healthCondition !== 'healthy' ? pet.healthCondition : null
  const wanted = condition ? CONDITION_TAGS[condition] || [] : []
  const stage = KNOWN_STAGES.includes(pet.lifeStage) ? pet.lifeStage : null
  // a dog's own breed-size answer (or a grown dog's weight) picks the size line.
  // A profile with neither keeps every size: the owner can add it later.
  const petSize = petSizeClass(pet, stage)
  // the daily-life questions are only asked about dogs and cats; another species
  // (or an old hand-edited profile) keeps the neutral answer
  const activity =
    pet.species === 'dog' || pet.species === 'cat' ? normalizeActivity(pet.activity) : 'normal'
  const indoorCat =
    pet.species === 'cat' &&
    typeof pet.environment === 'string' &&
    pet.environment.trim().toLowerCase() === 'indoor'

  // an old or hand-edited profile can name an allergen we have no rule for, so
  // the notice names it in words (never as the stored code) and one notice
  // covers the whole list, keeping the notice code unique
  const unknownAllergies = allergies.filter((allergy) => !ALLERGEN_TERMS[allergy])
  if (unknownAllergies.length > 0) {
    const names = unknownAllergies.map((allergy) => findLabel(ALLERGY_OPTIONS, allergy))
    result.notices.push({
      code: 'unknown-allergy',
      message:
        unknownAllergies.length === 1
          ? `"${names[0]}" is not an allergy our list covers, so we could not screen products for it. Check every label carefully.`
          : `${names.map((n) => `"${n}"`).join(', ')} are not allergies our list covers, so we could not screen products for them. Check every label carefully.`,
    })
  }

  const eligible = []
  for (const product of products || []) {
    const exclude = (rule, reason) => {
      result.excluded.push({ id: product.prod_id, name: product.prod_name || '', rule, reason })
    }

    const unavailable = unavailableReason(product)
    if (unavailable) {
      exclude('unavailable', unavailable)
      continue
    }

    if (isNonFood(product)) {
      exclude('non-food', 'Not a food item')
      continue
    }

    const profile = deriveProfile(product)
    if (!profile.species.includes(pet.species)) {
      exclude('species', `Not a ${pet.species} product`)
      continue
    }
    // a cat-category row whose own name says "Dog Food" cannot be trusted for
    // either animal, so it is refused instead of guessed
    if (speciesMismatch(product)) {
      exclude('species', 'The name and the category disagree on the animal')
      continue
    }

    // a stage-specific product must match the pet's stage
    if (stage && !profile.lifeStage.includes(stage)) {
      exclude('lifeStage', `Not for ${stage} ${pet.species}`)
      continue
    }
    // a growing pet needs food that names its stage; a food with no stage
    // word (e.g. "Urinary S/O Big Dog") is not checked for age, so it is hidden
    if (GROWTH_STAGES.includes(stage) && !profile.stageExplicit) {
      exclude('lifeStage', `Does not say it is for ${stage} ${pet.species}`)
      continue
    }

    const hitAllergens = allergensFor(product).filter((group) => allergies.includes(group))
    if (hitAllergens.length > 0) {
      exclude('allergen', `Contains ${hitAllergens.join(', ')}`)
      continue
    }

    const matches = wanted.some((tag) => profile.healthTags.includes(tag))
    const isTherapeutic =
      profile.healthTags.some((tag) => THERAPEUTIC_TAGS.has(tag)) ||
      VET_DIET_RE.test(product.prod_name || '')
    if (isTherapeutic && !matches) {
      exclude(
        'therapeutic',
        condition
          ? 'Condition-specific food for a different condition'
          : 'Condition-specific food; only for a pet with a matching condition'
      )
      continue
    }

    // a "Small Breed" food is not right for a large dog. A size word is only a
    // hint, so a product with no size word stays available to every dog.
    const dietSize = dietSizeClass(product)
    if (petSize && dietSize && dietSize !== petSize) {
      exclude('size', `Made for ${dietSize} dogs`)
      continue
    }

    eligible.push({ product, profile, matches, treat: isTreat(product), dietSize })
  }

  const lowActivity = activity === 'low'

  const scored = eligible.map(({ product, profile, matches, treat, dietSize }) => {
    let score = 0
    const reasons = []
    const warnings = allergies.length > 0 ? [LABEL_CHECK_WARNING] : []
    // a reason is listed once even when two rules agree on it
    const addReason = (reason) => {
      if (!reasons.includes(reason)) reasons.push(reason)
    }

    if (pet.lifeStage && profile.lifeStage.includes(pet.lifeStage)) {
      score += 3
      addReason(`Suitable for ${pet.lifeStage} ${pet.species}`)
      // products built for this stage beat products that merely suit it
      // (an "All Stages" food suits every stage but is built for none)
      if (profile.stageSpecific) score += 2
    }

    // a treat or topper is not a complete meal, so it never outranks real food
    if (treat) score -= 4

    if (condition) {
      if (matches) {
        score += 5
        addReason(`Formulated for ${CONDITION_PHRASE[condition] || condition}`)
      } else {
        addReason(GENERAL_FORMULA_REASON)
      }
    } else if (profile.healthTags.includes('healthy')) {
      score += 1
      addReason('General wellness formula')
    }

    if (allergies.length > 0 && profile.healthTags.includes('allergy-friendly')) {
      score += 2
      addReason('Allergy-friendly recipe')
    }

    // the score before the daily-life hints. Only this score decides whether a
    // product is shown, so a soft preference can move a product but never hide it.
    const baseScore = score

    // Daily life is a soft preference: it changes the order and the reason
    // lines, never the list of products. A high-energy formula is a poor first
    // pick for a calm pet, so it is pushed down and never wears the top badge.
    const name = product.prod_name || ''
    const energyFormula = ENERGY_RE.test(name)
    const lightFormula = LIGHT_RE.test(name)
    const indoorFormula = INDOOR_RE.test(name)
    const hairballFormula = HAIRBALL_RE.test(name)
    let lowFit = false

    if (energyFormula) {
      if (activity === 'high') {
        score += 2
        addReason(`High-energy formula for an active ${pet.species}`)
      } else if (lowActivity) {
        score -= 3
        lowFit = true
        warnings.push(LOW_ACTIVITY_WARNING)
      }
    }

    if (lowActivity && lightFormula) {
      score += 2
      addReason('Light formula for a less active pet')
    }

    // one indoor bonus at most: an indoor cat with low activity is still only
    // one preference, so the two rules never add up to four points
    if ((indoorCat || lowActivity) && indoorFormula) {
      score += 2
      addReason(indoorCat ? 'Indoor formula' : 'Indoor formula for a calm pet')
    }

    if (indoorCat && hairballFormula) {
      score += 2
      addReason('Hairball control')
    }

    // the size rule already hid every other size, so the bonus only marks the
    // product that was built for this pet's size
    if (petSize && dietSize === petSize) {
      score += 1
      addReason(`Made for ${petSize}-breed dogs`)
    }

    return {
      id: product.prod_id,
      prod_id: product.prod_id,
      name: product.prod_name,
      price: Number(product.price),
      image: product.image_url || '',
      brand: product.brand || '',
      collection: product.category || '',
      stock: Number(product.stock_quantity || 0),
      score,
      // the score before the daily-life hints: it alone decides whether the
      // product is shown, so a soft hint can move a product but never hide it
      baseScore,
      reasons,
      warnings,
      // a treat is never a top match, even when it scores well
      treat,
      // a high-energy formula for a calm pet is shown, but never first
      lowFit,
      section: condition && !matches ? 'other' : 'best',
    }
  })

  // only the pre-lifestyle score decides whether a product is shown, so a soft
  // daily-life hint can move a product up or down but never add or remove one
  const ranked = scored.filter((item) => item.baseScore > 0).sort(byRank)
  result.best = ranked.filter((item) => item.section === 'best')
  result.other = ranked.filter((item) => item.section === 'other')
  result.matchedCondition = !condition || result.best.length > 0

  // the top match is the first complete food that fits the pet's daily life, so
  // neither a pouch of treats nor a high-energy formula for a calm pet ever
  // wears the badge. When every option is a poor fit, no badge is shown.
  const topComplete = result.best.find((item) => !item.treat && !item.lowFit)
  if (topComplete) topComplete.topMatch = true

  if (condition && result.best.length === 0) {
    result.notices.push({
      code: 'no-condition-match',
      message: `No condition-specific formula for ${CONDITION_PHRASE[condition] || condition} is in stock right now. The options shown are general foods. Consult your veterinarian before switching diets.`,
    })
  }

  if (allergies.length > 0) {
    result.notices.push({ code: 'label-check', message: LABEL_CHECK_NOTICE })
  }

  return result
}

// Flat list for the cart strip and search: best matches first, then other options.
// Returns { items, matchedCondition }. matchedCondition is false when a pet with a
// condition has no condition-specific option in stock.
export function recommendFromCatalog(pet, products) {
  const { best, other, matchedCondition } = evaluate(pet, products)
  return { items: [...best, ...other], matchedCondition }
}
