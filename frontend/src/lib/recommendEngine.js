// Rule-based recommendation engine over the live store catalog.
// The product table has no structured species/health fields, so profiles are
// derived from category, name, and brand text. Only priced, in-stock rows are
// recommendable because every result must be purchasable.

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

const ALL_STAGES = {
  dog: ['puppy', 'adult', 'senior'],
  cat: ['kitten', 'adult', 'senior'],
  bird: ['juvenile', 'adult', 'senior'],
  fish: ['juvenile', 'adult'],
}

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

  const healthTags = ['healthy']
  for (const { tag, words } of TAG_KEYWORDS) {
    if (words.some((w) => haystack.includes(w))) healthTags.push(tag)
  }

  return { species, lifeStage, healthTags, stageExplicit }
}

// Returns { items, matchedCondition }.
// matchedCondition is false when a conditioned pet was matched against general
// formulas because the catalog has no condition-specific option in stock.
export function recommendFromCatalog(pet, products) {
  if (!pet || !pet.species) return { items: [], matchedCondition: false }

  const candidates = []
  for (const product of products || []) {
    if (product.is_active === false) continue
    if (!(Number(product.price) > 0)) continue
    if (Number(product.stock_quantity || 0) <= 0) continue
    if ((product.category || '').toLowerCase() === 'test') continue
    const profile = deriveProfile(product)
    if (!profile.species.includes(pet.species)) continue
    candidates.push({ product, profile })
  }

  const condition = pet.healthCondition && pet.healthCondition !== 'healthy' ? pet.healthCondition : null
  let pool = candidates
  let matchedCondition = !condition
  if (condition) {
    const wanted = CONDITION_TAGS[condition] || []
    const specific = candidates.filter(({ profile }) =>
      wanted.some((t) => profile.healthTags.includes(t))
    )
    if (specific.length > 0) {
      pool = specific
      matchedCondition = true
    }
  }

  const hasAllergies = Array.isArray(pet.allergies) && pet.allergies.length > 0 && !pet.allergies.includes('none')

  const scored = pool
    .map(({ product, profile }) => {
      let score = 0
      const reasons = []

      if (pet.lifeStage && profile.lifeStage.includes(pet.lifeStage)) {
        score += 3
        reasons.push(`Suitable for ${pet.lifeStage} ${pet.species}`)
        // products built for this stage beat products that merely suit it
        if (profile.stageExplicit) score += 2
      }

      if (condition) {
        const wanted = CONDITION_TAGS[condition] || []
        const hits = wanted.filter((t) => profile.healthTags.includes(t))
        if (hits.length > 0) {
          score += 5 * hits.length
          reasons.push(`Formulated for ${CONDITION_PHRASE[condition] || condition}`)
        } else {
          reasons.push('General formula while condition-specific options are out of stock')
        }
      }

      if (!condition && profile.healthTags.includes('healthy')) {
        score += 1
        reasons.push('General wellness formula')
      }

      if (hasAllergies && profile.healthTags.includes('allergy-friendly')) {
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
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.price - b.price)

  return { items: scored, matchedCondition }
}
