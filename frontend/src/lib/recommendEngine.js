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
//   2. species     - not for this species (hard exclude)
//   3. lifeStage   - every pet only gets products for its own stage or for
//                    every stage (hard exclude)
//   4. allergen    - product text names an allergen the pet has (hard exclude)
//   5. therapeutic - condition-specific products only for a pet whose condition
//                    matches one of their tags (hard exclude)
//   6. score       - life stage, one condition match (never one per tag), a
//                    healthy baseline, and an allergy-friendly boost. Products
//                    that match the pet's condition go in `best`; other eligible
//                    products go in `other` and are labelled as general foods.
//
// Ties are broken by price (low first), then name, then id, so the same input
// always gives the same order.

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
  { tag: 'urinary-support', words: ['urinary', 'bladder'] },
  { tag: 'heart-support', words: ['cardiac', 'heart'] },
  { tag: 'liver-support', words: ['hepatic', 'liver'] },
  { tag: 'sensitive-stomach', words: ['gastrointestinal', 'gastro', 'digestive', 'sensitive'] },
  { tag: 'allergy-friendly', words: ['hypoallergenic', 'allergen'] },
  { tag: 'weight-management', words: ['satiety', 'weight', 'obesity', 'low cal'] },
  { tag: 'skin-coat', words: ['hair', 'skin', 'derma'] },
  { tag: 'dental', words: ['dental', 'teeth', 'oral'] },
  { tag: 'diabetes-safe', words: ['diabetes', 'diabetic'] },
  { tag: 'joint-support', words: ['glucosamine', 'mobility', 'joint', 'arthritis'] },
  { tag: 'growth-support', words: ['puppy', 'kitten', 'baby', 'junior', 'growth'] },
]

// Allergen group (the same names as the form's allergy options) -> words that
// name it in product text. Only unambiguous names are listed. Rice is left out of
// "grain" on purpose until the expert review decides. PENDING EXPERT REVIEW.
const ALLERGEN_TERMS = {
  chicken: ['chicken'],
  beef: ['beef'],
  fish: ['fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'squid', 'seafood', 'sardine', 'anchovy', 'mackerel', 'herring'],
  grain: ['wheat', 'barley', 'rye', 'oats', 'oatmeal'],
  dairy: ['dairy', 'milk', 'cheese', 'whey', 'yogurt', 'yoghurt'],
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

const GENERAL_FORMULA_REASON = 'General formula while condition-specific options are out of stock'
const LABEL_CHECK_WARNING = 'Check the label: ingredients are not listed in our catalog.'
const LABEL_CHECK_NOTICE = 'Our catalog does not list full ingredients. Always check the product label for allergens.'

// a whole word, allowing a plural "s" or "es" (kidneys, eggs, allergens)
function wordPattern(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`)
}

const TAG_PATTERNS = TAG_KEYWORDS.map(({ tag, words }) => ({ tag, patterns: words.map(wordPattern) }))
const ALLERGEN_PATTERNS = Object.entries(ALLERGEN_TERMS).map(([group, words]) => ({
  group,
  patterns: words.map(wordPattern),
}))

export function speciesFor(category) {
  const c = (category || '').toLowerCase()
  const row = SPECIES_BY_CATEGORY.find((r) => r.match(c))
  return row ? row.species : []
}

export function deriveProfile(product) {
  const haystack = `${product.prod_name || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase()
  const species = speciesFor(product.category)

  const lifeStage = []
  if (/\b(puppy|puppies)\b/.test(haystack)) lifeStage.push('puppy')
  if (/\b(kitten|kittens|babycat)\b/.test(haystack)) lifeStage.push('kitten')
  if (/\b(junior|baby)\b/.test(haystack)) {
    if (species.includes('cat')) lifeStage.push('kitten')
    else if (species.includes('dog')) lifeStage.push('puppy')
    else lifeStage.push('juvenile')
  }
  if (/\b(senior|geriatric)\b/.test(haystack)) lifeStage.push('senior')
  if (/\badult\b/.test(haystack)) lifeStage.push('adult')
  const stageExplicit = lifeStage.length > 0
  // products with no stage marker suit every stage of their species
  if (!stageExplicit && species.length > 0) {
    for (const s of species) {
      for (const stage of ALL_STAGES[s] || []) {
        if (!lifeStage.includes(stage)) lifeStage.push(stage)
      }
    }
  }

  // the description also feeds the health keywords (e.g. "for sensitive stomachs")
  const healthText = `${haystack} ${(product.description || '').toLowerCase()}`
  const healthTags = ['healthy']
  for (const { tag, patterns } of TAG_PATTERNS) {
    if (patterns.some((p) => p.test(healthText))) healthTags.push(tag)
  }

  return { species, lifeStage, healthTags, stageExplicit }
}

// Allergen groups named in a product's text (name, brand, description). The
// catalog has no ingredient list yet, so this is a best-effort check and the
// results carry a "check the label" warning.
export function allergensFor(product) {
  const text = `${product.prod_name || ''} ${product.brand || ''} ${product.description || ''}`.toLowerCase()
  return ALLERGEN_PATTERNS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(({ group }) => group)
}

// 'none' means no allergy. It is ignored when other allergies are listed too,
// so ['none', 'chicken'] behaves exactly like ['chicken'].
function activeAllergies(pet) {
  const list = Array.isArray(pet.allergies) ? pet.allergies : []
  return [...new Set(list.filter((a) => a && a !== 'none'))]
}

function unavailableReason(product) {
  if (product.is_active === false) return 'Listing is inactive'
  if (!(Number(product.price) > 0)) return 'No price set'
  if (Number(product.stock_quantity || 0) <= 0) return 'Out of stock'
  if ((product.category || '').toLowerCase() === 'test') return 'Test listing'
  return null
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

  for (const allergy of allergies) {
    if (!ALLERGEN_TERMS[allergy]) {
      result.notices.push({
        code: 'unknown-allergy',
        message: `"${allergy}" is not a known allergy category. Check every label carefully.`,
      })
    }
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

    const profile = deriveProfile(product)
    if (!profile.species.includes(pet.species)) {
      exclude('species', `Not a ${pet.species} product`)
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
    const isTherapeutic = profile.healthTags.some((tag) => THERAPEUTIC_TAGS.has(tag))
    if (isTherapeutic && !matches) {
      exclude(
        'therapeutic',
        condition
          ? 'Condition-specific food for a different condition'
          : 'Condition-specific food; only for a pet with a matching condition'
      )
      continue
    }

    eligible.push({ product, profile, matches })
  }

  const scored = eligible.map(({ product, profile, matches }) => {
    let score = 0
    const reasons = []

    if (pet.lifeStage && profile.lifeStage.includes(pet.lifeStage)) {
      score += 3
      reasons.push(`Suitable for ${pet.lifeStage} ${pet.species}`)
      // products built for this stage beat products that merely suit it
      if (profile.stageExplicit) score += 2
    }

    if (condition) {
      if (matches) {
        score += 5
        reasons.push(`Formulated for ${CONDITION_PHRASE[condition] || condition}`)
      } else {
        reasons.push(GENERAL_FORMULA_REASON)
      }
    } else if (profile.healthTags.includes('healthy')) {
      score += 1
      reasons.push('General wellness formula')
    }

    if (allergies.length > 0 && profile.healthTags.includes('allergy-friendly')) {
      score += 2
      reasons.push('Allergy-friendly recipe')
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
      reasons,
      warnings: allergies.length > 0 ? [LABEL_CHECK_WARNING] : [],
      section: condition && !matches ? 'other' : 'best',
    }
  })

  const ranked = scored.filter((item) => item.score > 0).sort(byRank)
  result.best = ranked.filter((item) => item.section === 'best')
  result.other = ranked.filter((item) => item.section === 'other')
  result.matchedCondition = !condition || result.best.length > 0

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
