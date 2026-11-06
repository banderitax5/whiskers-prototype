import { describe, it, expect } from 'vitest'
import { speciesFor, deriveProfile, recommendFromCatalog, evaluate, petSizeClass } from './recommendEngine'

const baseProduct = {
  prod_id: 'p1',
  prod_name: 'Whiskers Dry Dog Food',
  brand: 'Whiskers',
  category: 'dogs food',
  price: 100,
  stock_quantity: 5,
  is_active: true,
  image_url: 'img.png',
}

describe('speciesFor', () => {
  it('maps categories to species', () => {
    expect(speciesFor('dogs food')).toEqual(['dog'])
    expect(speciesFor('cats wet food')).toEqual(['cat'])
    expect(speciesFor('birds')).toEqual(['bird'])
    expect(speciesFor('fish')).toEqual(['fish'])
    expect(speciesFor('pets milk')).toEqual(['dog', 'cat'])
  })

  it('returns empty for unknown or missing categories', () => {
    expect(speciesFor('toys')).toEqual([])
    expect(speciesFor(undefined)).toEqual([])
  })
})

describe('deriveProfile', () => {
  it('detects explicit life stages', () => {
    const p = deriveProfile({ ...baseProduct, prod_name: 'Puppy Growth Formula' })
    expect(p.lifeStage).toContain('puppy')
    expect(p.stageExplicit).toBe(true)
  })

  it('defaults stageless species products to every stage', () => {
    const p = deriveProfile(baseProduct)
    expect(p.stageExplicit).toBe(false)
    expect(p.lifeStage).toEqual(expect.arrayContaining(['puppy', 'adult', 'senior']))
  })

  it('always includes a healthy tag and derives keyword tags', () => {
    const plain = deriveProfile(baseProduct)
    expect(plain.healthTags).toContain('healthy')

    const renal = deriveProfile({ ...baseProduct, prod_name: 'Renal Support Kibble' })
    expect(renal.healthTags).toContain('kidney-safe')

    const skin = deriveProfile({ ...baseProduct, prod_name: 'Hair and Skin Care Food' })
    expect(skin.healthTags).toContain('skin-coat')
  })
})

describe('deriveProfile: reading the life stage from the name', () => {
  const profile = (prod_name, category = 'dogs food') =>
    deriveProfile({ ...baseProduct, prod_name, category })

  it('reads the stage word wherever it sits in the name', () => {
    expect(profile('Royal Canin Medium Puppy 4kg').lifeStage).toEqual(['puppy'])
    expect(profile('Brit Care Junior Large Breed').lifeStage).toEqual(['puppy'])
    expect(profile('Royal Canin Maxi Senior 15kg').lifeStage).toEqual(['senior'])
    expect(profile('Royal Canin Mini Adult 8kg').lifeStage).toEqual(['adult'])
    expect(profile('Sweet Kitten Salmon 10KG', 'cats food').lifeStage).toEqual(['kitten'])
  })

  it('treats All Stages and All Life Stages as every stage of the species', () => {
    const dog = profile('Aozi All Stages Salmon/Tuna 20KG')
    expect(dog.stageExplicit).toBe(true)
    // suits every stage, but is not built for one, so it earns no stage bonus
    expect(dog.stageSpecific).toBe(false)
    expect(dog.lifeStage).toEqual(['puppy', 'adult', 'senior'])

    const cat = profile('Kit Cat All Life Stages Chicken', 'cats food')
    expect(cat.stageExplicit).toBe(true)
    expect(cat.stageSpecific).toBe(false)
    expect(cat.lifeStage).toEqual(['kitten', 'adult', 'senior'])
  })

  it('marks a name that names one stage as built for that stage', () => {
    expect(profile('Royal Canin Medium Puppy 4kg').stageSpecific).toBe(true)
    expect(profile('Whiskers Dry Dog Food').stageSpecific).toBe(false)
  })

  it('reads growth and mature as the stage they mean', () => {
    expect(profile('Purina One Growth Formula').lifeStage).toEqual(['puppy'])
    expect(profile('Growth Formula Cat Food', 'cats food').lifeStage).toEqual(['kitten'])
    expect(profile('Iams ProActive Health Mature Adult').lifeStage).toEqual(['adult', 'senior'])
  })

  it('reads an age marker of 7 and above as senior', () => {
    expect(profile("Hill's Science Diet Adult 7+ Chicken").lifeStage).toEqual(['adult', 'senior'])
    expect(profile('Whiskas Senior 11+ Ocean Fish', 'cats food').lifeStage).toEqual(['senior'])
    expect(profile('Whiskers Adult 3+ Chicken').lifeStage).toEqual(['adult'])
  })

  it('lists each stage only once', () => {
    expect(profile('Junior Puppy Formula').lifeStage).toEqual(['puppy'])
    expect(profile('Puppy Growth Formula').lifeStage).toEqual(['puppy'])
  })

  it('leaves a name with no stage words as every stage, not explicit', () => {
    const p = profile('Royal Canin Urinary S/O Big Dog 2kg')
    expect(p.stageExplicit).toBe(false)
    expect(p.lifeStage).toEqual(['puppy', 'adult', 'senior'])
  })

  it('does not read a weight as an age marker', () => {
    expect(profile('Royal Canin Maxi Adult 15KG').lifeStage).toEqual(['adult'])
  })

  it('shows an All Stages food to a puppy', () => {
    const allStages = { ...baseProduct, prod_id: 'all', prod_name: 'Aozi All Stages Salmon/Tuna 20KG' }
    const puppy = { species: 'dog', lifeStage: 'puppy', healthCondition: 'healthy', allergies: [] }
    const r = evaluate(puppy, [allStages])
    expect(r.best.map((p) => p.id)).toEqual(['all'])
  })

  it('ranks a puppy-only food above an All Stages food for a puppy', () => {
    const products = [
      { ...baseProduct, prod_id: 'all', prod_name: 'Aozi All Stages Salmon/Tuna 20KG' },
      { ...baseProduct, prod_id: 'puppy', prod_name: 'Royal Canin Medium Puppy 4kg' },
    ]
    const puppy = { species: 'dog', lifeStage: 'puppy', healthCondition: 'healthy', allergies: [] }
    const r = evaluate(puppy, products)
    expect(r.best.map((p) => p.id)).toEqual(['puppy', 'all'])
    expect(r.best[0].score).toBe(r.best[1].score + 2)
  })
})

describe('recommendFromCatalog', () => {
  const dog = { species: 'dog', lifeStage: 'adult', healthCondition: 'healthy', allergies: [] }

  it('returns empty without a valid pet', () => {
    expect(recommendFromCatalog(null, [baseProduct]).items).toEqual([])
    expect(recommendFromCatalog({}, [baseProduct]).items).toEqual([])
  })

  it('excludes inactive, unpriced, out-of-stock, test, and wrong-species rows', () => {
    const products = [
      baseProduct,
      { ...baseProduct, prod_id: 'p2', is_active: false },
      { ...baseProduct, prod_id: 'p3', price: 0 },
      { ...baseProduct, prod_id: 'p4', stock_quantity: 0 },
      { ...baseProduct, prod_id: 'p5', category: 'test' },
      { ...baseProduct, prod_id: 'p6', category: 'cats food' },
    ]
    const { items } = recommendFromCatalog(dog, products)
    expect(items.map((i) => i.id)).toEqual(['p1'])
  })

  it('prefers condition-specific products and marks the match', () => {
    const products = [
      { ...baseProduct, prod_id: 'general', prod_name: 'Adult Dog Food' },
      { ...baseProduct, prod_id: 'renal', prod_name: 'Renal Kidney Support' },
    ]
    const { items, matchedCondition } = recommendFromCatalog(
      { ...dog, healthCondition: 'kidney' },
      products
    )
    expect(matchedCondition).toBe(true)
    expect(items[0].id).toBe('renal')
    expect(items[0].reasons.join(' ')).toContain('kidney support')
  })

  it('falls back to general formulas when no condition-specific option exists', () => {
    const { items, matchedCondition } = recommendFromCatalog(
      { ...dog, healthCondition: 'kidney' },
      [baseProduct]
    )
    expect(matchedCondition).toBe(false)
    expect(items.length).toBe(1)
    expect(items[0].reasons.join(' ')).toContain('General formula - no condition-specific match available')
  })

  it('ranks explicit-stage products above generic ones', () => {
    const products = [
      { ...baseProduct, prod_id: 'explicit', prod_name: 'Adult Maintenance Formula' },
      { ...baseProduct, prod_id: 'generic', prod_name: 'Whiskers Dry Dog Food' },
    ]
    const { items } = recommendFromCatalog(dog, products)
    expect(items[0].id).toBe('explicit')
  })

  it('breaks score ties by lowest price', () => {
    const products = [
      { ...baseProduct, prod_id: 'pricy', price: 300 },
      { ...baseProduct, prod_id: 'cheap', price: 100 },
    ]
    const { items } = recommendFromCatalog(dog, products)
    expect(items.map((i) => i.id)).toEqual(['cheap', 'pricy'])
  })

  it('boosts allergy-friendly products for allergic pets', () => {
    const products = [
      { ...baseProduct, prod_id: 'regular', prod_name: 'Adult Dog Food' },
      { ...baseProduct, prod_id: 'hypo', prod_name: 'Hypoallergenic Adult Food' },
    ]
    const { items } = recommendFromCatalog({ ...dog, allergies: ['chicken'] }, products)
    expect(items[0].id).toBe('hypo')
    expect(items[0].reasons).toContain('Allergy-friendly recipe')
  })
})

// Sample catalog only: these are test fixtures, not real store products.
const sample = [
  { ...baseProduct, prod_id: 'g-chicken', prod_name: 'Whiskers Adult Dog Food Chicken Recipe', description: 'Chicken recipe' },
  { ...baseProduct, prod_id: 'salmon', prod_name: 'Salmon Adult Dog Food' },
  { ...baseProduct, prod_id: 'tuna-treat', prod_name: 'Tuna Dog Treats', category: 'dogs treats' },
  { ...baseProduct, prod_id: 'fish-oil', prod_name: 'Fish Oil Skin Supplement', category: 'dogs supplements' },
  { ...baseProduct, prod_id: 'fish-meal', prod_name: 'Adult Fish Meal Dog Food' },
  { ...baseProduct, prod_id: 'shrimp', prod_name: 'Shrimp Adult Dog Food' },
  { ...baseProduct, prod_id: 'squid', prod_name: 'Squid Adult Dog Food' },
  { ...baseProduct, prod_id: 'renal', prod_name: 'Renal Kidney Support Dog Food' },
  { ...baseProduct, prod_id: 'renal-uro', prod_name: 'Renal Urinary Care Dog Food' },
  { ...baseProduct, prod_id: 'diabetic', prod_name: 'Diabetic Care Dog Food' },
  { ...baseProduct, prod_id: 'dental', prod_name: 'Dental Chew Dog', category: 'dogs treats' },
  { ...baseProduct, prod_id: 'puppy', prod_name: 'Puppy Growth Formula' },
  { ...baseProduct, prod_id: 'senior', prod_name: 'Senior Dog 7+ Formula' },
  { ...baseProduct, prod_id: 'adult-dog', prod_name: 'Adult Maintenance Formula' },
  { ...baseProduct, prod_id: 'hypo', prod_name: 'Hypoallergenic Adult Dog Food' },
  { ...baseProduct, prod_id: 'lamb', prod_name: 'Lamb and Rice Adult Dog Food' },
  { ...baseProduct, prod_id: 'milk', prod_name: 'Pets Milk Original', category: 'pets milk' },
  { ...baseProduct, prod_id: 'cat-adult', prod_name: 'Adult Hairball Cat Food', category: 'cats food' },
  { ...baseProduct, prod_id: 'kitten', prod_name: 'Kitten Starter Cat Food', category: 'cats food' },
  { ...baseProduct, prod_id: 'fish-flake', prod_name: 'Fish Flakes Aquarium Food', category: 'fish' },
]

const ids = (list) => list.map((p) => p.id)
const dogAdult = { species: 'dog', lifeStage: 'adult', healthCondition: 'healthy', allergies: [] }

describe('evaluate: allergy exclusion', () => {
  it('excludes every fish-type product for a dog with a fish allergy', () => {
    const r = evaluate({ ...dogAdult, allergies: ['fish'] }, sample)
    const allergenIds = r.excluded.filter((e) => e.rule === 'allergen').map((e) => e.id)
    expect(allergenIds).toEqual(expect.arrayContaining(['salmon', 'tuna-treat', 'fish-oil', 'fish-meal', 'shrimp', 'squid']))
    expect(ids(r.best)).not.toContain('salmon')
    expect(ids(r.best)).not.toContain('fish-oil')
    expect(ids(r.other)).toEqual([])
  })

  it('treats ["none", "chicken"] exactly like ["chicken"]', () => {
    const both = evaluate({ ...dogAdult, allergies: ['none', 'chicken'] }, sample)
    const one = evaluate({ ...dogAdult, allergies: ['chicken'] }, sample)
    expect(ids(both.best)).toEqual(ids(one.best))
    expect(both.excluded).toEqual(one.excluded)
    expect(both.excluded.map((e) => e.id)).toContain('g-chicken')
  })

  it('returns nothing and explains why when the only product has the allergen', () => {
    const chickenOnly = sample.filter((p) => p.prod_id === 'g-chicken')
    const r = evaluate({ ...dogAdult, allergies: ['chicken'] }, chickenOnly)
    expect(r.best).toEqual([])
    expect(r.other).toEqual([])
    expect(r.excluded).toEqual([expect.objectContaining({ id: 'g-chicken', rule: 'allergen' })])
  })

  it('adds a label-check warning when allergies are set', () => {
    const r = evaluate({ ...dogAdult, allergies: ['beef'] }, sample)
    expect(r.notices.map((n) => n.code)).toContain('label-check')
    expect(r.best[0].warnings.length).toBeGreaterThan(0)
  })

  it('does not flag "grain-free" wording as grain', () => {
    const product = { ...baseProduct, prod_id: 'gf', prod_name: 'Grain-Free Adult Dog Food' }
    expect(evaluate({ ...dogAdult, allergies: ['grain'] }, [product]).excluded).toEqual([])
  })

  it('catches fish sold under a local or compound name', () => {
    const rows = [
      { ...baseProduct, prod_id: 'oceanfish', prod_name: 'Whiskas Adult Oceanfish 20KG' },
      { ...baseProduct, prod_id: 'cod', prod_name: 'Fancy Feast Classic Cod 85G' },
      { ...baseProduct, prod_id: 'crabstick', prod_name: 'Deboned Chicken And Crabstick 80G' },
      { ...baseProduct, prod_id: 'bonito', prod_name: 'Cat Puree Bonito 15G' },
      { ...baseProduct, prod_id: 'bangus', prod_name: 'Bangus Cat Food 400G' },
    ]
    const r = evaluate({ ...dogAdult, allergies: ['fish'] }, rows)
    expect(r.best).toEqual([])
    expect(r.other).toEqual([])
    expect(r.excluded.map((e) => e.id).sort()).toEqual(
      ['bangus', 'bonito', 'cod', 'crabstick', 'oceanfish']
    )
  })

  it('catches the short ingredient spellings a Filipino store uses', () => {
    const r = evaluate({ ...dogAdult, allergies: ['chicken', 'beef'] }, [
      { ...baseProduct, prod_id: 'ckn', prod_name: 'Pedigree Pouch Adult CKN N LVR Chunks 130G' },
      { ...baseProduct, prod_id: 'bf', prod_name: 'Pedigree Pouch Adult BF Chunks In Gravy 130G' },
      { ...baseProduct, prod_id: 'veal', prod_name: 'Special Dog Can Pate W Veal N Vegetables 400G' },
    ])
    expect(r.best).toEqual([])
    expect(r.excluded.map((e) => e.id).sort()).toEqual(['bf', 'ckn', 'veal'])
  })

  it('does not treat "grain-free" or a brand name as an allergen', () => {
    const rows = [
      { ...baseProduct, prod_id: 'gf', prod_name: 'Grain-Free Adult Dog Food' },
      { ...baseProduct, prod_id: 'brand', prod_name: 'Wheaty Paws Adult Food' },
    ]
    const r = evaluate({ ...dogAdult, allergies: ['grain'] }, rows)
    // "wheat" inside "Wheaty" is not a word of its own, and "grain-free" is the
    // absence of grain, so neither is the allergen the pet avoids
    expect(r.excluded.filter((e) => e.rule === 'allergen')).toEqual([])
    expect(ids(r.best).sort()).toEqual(['brand', 'gf'])
  })

  it('screens an older stored name the same way as today\'s name', () => {
    const wheat = evaluate({ ...dogAdult, allergies: ['wheat'] }, sample)
    const grain = evaluate({ ...dogAdult, allergies: ['grain'] }, sample)
    expect(wheat.excluded).toEqual(grain.excluded)
    expect(ids(wheat.best)).toEqual(ids(grain.best))

    const seafood = evaluate({ ...dogAdult, allergies: ['seafood'] }, sample)
    expect(seafood.excluded.map((e) => e.id)).toContain('salmon')
    expect(seafood.notices.map((n) => n.code)).not.toContain('unknown-allergy')
  })
})

describe('evaluate: therapeutic gating', () => {
  it('hides condition-specific foods from a healthy adult dog', () => {
    const r = evaluate(dogAdult, sample)
    expect(ids(r.best)).not.toEqual(expect.arrayContaining(['renal', 'renal-uro', 'diabetic', 'dental']))
    expect(r.excluded.filter((e) => e.rule === 'therapeutic').map((e) => e.id)).toEqual(
      expect.arrayContaining(['renal', 'renal-uro', 'diabetic', 'dental'])
    )
  })

  it('hides a vet diet whose name has no condition word', () => {
    const rows = [
      { ...baseProduct, prod_id: 'vd', prod_name: 'Brit GF VD Dog Can Hypoallergenic 400G' },
      { ...baseProduct, prod_id: 'vt', prod_name: 'Brit GF VT Dog Cat Can Recovery 400G' },
      { ...baseProduct, prod_id: 'rx', prod_name: 'Prescription Adult Dog Food' },
    ]
    const r = evaluate(dogAdult, rows)
    expect(r.best).toEqual([])
    expect(r.other).toEqual([])
    expect(r.excluded.map((e) => e.id).sort()).toEqual(['rx', 'vd', 'vt'])
    expect(r.excluded.every((e) => e.rule === 'therapeutic')).toBe(true)
  })

  it('still shows a vet diet to the pet whose condition it matches', () => {
    const r = evaluate({ ...dogAdult, healthCondition: 'kidney' }, [
      { ...baseProduct, prod_id: 'vd-renal', prod_name: 'Brit GF VD Dog Can Renal 400G' },
    ])
    expect(ids(r.best)).toEqual(['vd-renal'])
  })

  it('shows only the matching condition food as best for a kidney dog, and hides diabetic foods', () => {
    const r = evaluate({ ...dogAdult, healthCondition: 'kidney' }, sample)
    // equal score and price, so the name decides: "Renal Kidney..." before "Renal Urinary..."
    expect(ids(r.best)).toEqual(['renal', 'renal-uro'])
    expect(ids(r.other)).not.toContain('diabetic')
    expect(r.excluded.map((e) => e.id)).toContain('diabetic')
    expect(r.matchedCondition).toBe(true)
    expect(r.notices.map((n) => n.code)).not.toContain('no-condition-match')
  })

  it('scores a double kidney tag the same as a single tag', () => {
    const r = evaluate({ ...dogAdult, healthCondition: 'kidney' }, sample)
    const byId = Object.fromEntries(r.best.map((p) => [p.id, p]))
    expect(byId['renal-uro'].score).toBe(byId.renal.score)
  })

  it('puts general foods under other options with a notice when no condition match exists', () => {
    const r = evaluate({ species: 'fish', lifeStage: 'adult', healthCondition: 'diabetes', allergies: [] }, sample)
    expect(r.best).toEqual([])
    expect(ids(r.other)).toEqual(['fish-flake'])
    expect(r.other[0].reasons).toContain('General formula - no condition-specific match available')
    expect(r.notices.map((n) => n.code)).toContain('no-condition-match')
    expect(r.matchedCondition).toBe(false)
  })
})

describe('evaluate: rows that are not food', () => {
  it('refuses cat litter and shampoo filed under a pet category', () => {
    const rows = [
      { ...baseProduct, prod_id: 'litter', prod_name: 'Top Cat Bentonite 10L Coffee', category: 'cats food' },
      { ...baseProduct, prod_id: 'litter2', prod_name: 'Neo Clean Cat Litter Apple 4kg', category: 'cats food' },
      { ...baseProduct, prod_id: 'shampoo', prod_name: 'Puppy Safe 2-in-1 Pet Shampoo 1L', category: 'dogs food' },
      { ...baseProduct, prod_id: 'toothbrush', prod_name: 'Dent Fresh 360 Toothbrush 150G', category: 'dogs treats' },
      { ...baseProduct, prod_id: 'food', prod_name: 'Adult Chicken Dog Food 1kg', category: 'dogs food' },
    ]
    const r = evaluate(dogAdult, rows)
    expect(ids(r.best)).toEqual(['food'])
    expect(r.excluded.filter((e) => e.rule === 'non-food').map((e) => e.id).sort()).toEqual(
      ['litter', 'litter2', 'shampoo', 'toothbrush']
    )
  })

  it('keeps a real 1L pet milk, which is food', () => {
    const rows = [{ ...baseProduct, prod_id: 'milk', prod_name: 'Cosi Milk 1L', category: 'pets milk' }]
    const r = evaluate(dogAdult, rows)
    expect(r.excluded.filter((e) => e.rule === 'non-food')).toEqual([])
    expect(ids(r.best)).toEqual(['milk'])
  })
})

describe('evaluate: organ words that are ingredients, not therapy', () => {
  const rows = [
    { ...baseProduct, prod_id: 'hearts', prod_name: 'Adult Chicken With Hearts 400G' },
    { ...baseProduct, prod_id: 'liver', prod_name: 'Adult Beef & Liver 430G' },
    { ...baseProduct, prod_id: 'hepatic', prod_name: 'Hepatic Care Dog Food' },
    { ...baseProduct, prod_id: 'cardiac', prod_name: 'Cardiac Care Dog Food' },
  ]

  it('does not call "Chicken With Hearts" a heart diet', () => {
    const r = evaluate({ ...dogAdult, healthCondition: 'heart' }, rows)
    // only the named formula is a heart diet; the ingredient row is a general food
    expect(ids(r.best)).toEqual(['cardiac'])
    expect(ids(r.other)).toContain('hearts')
  })

  it('does not call "Beef & Liver" a liver diet', () => {
    const r = evaluate({ ...dogAdult, healthCondition: 'liver' }, rows)
    expect(ids(r.best)).toEqual(['hepatic'])
    expect(ids(r.other)).toContain('liver')
  })

  it('still tags a named condition formula', () => {
    expect(deriveProfile({ prod_name: 'Mr Vet Cat Pouch Heart Nutrition 70G' }).healthTags)
      .toContain('heart-support')
    expect(deriveProfile({ prod_name: 'Brit VD Urinary And Stress Relief Cat Pouch 85G' }).healthTags)
      .toContain('urinary-support')
  })
})

describe('evaluate: a name that disagrees with its category', () => {
  it('refuses a "Dog Food" row filed under Cats', () => {
    const row = { ...baseProduct, prod_id: 'mix', prod_name: 'Moochie Casserole Dog Food 85G', category: 'cats food' }
    const r = evaluate({ ...dogAdult, species: 'cat' }, [row])
    expect(r.best).toEqual([])
    expect(r.excluded[0].rule).toBe('species')
  })

  it('keeps a product that names both animals', () => {
    const row = { ...baseProduct, prod_id: 'both', prod_name: 'Dog & Cat Recovery Food', category: 'dogs food' }
    expect(evaluate(dogAdult, [row]).excluded).toEqual([])
  })
})

describe('evaluate: dog weight picks a breed-size line', () => {
  const rows = [
    { ...baseProduct, prod_id: 'small', prod_name: 'Adult Small Breed Dog Food' },
    { ...baseProduct, prod_id: 'medium', prod_name: 'Adult Medium Breed Dog Food' },
    { ...baseProduct, prod_id: 'large', prod_name: 'Adult Large Breed Dog Food' },
    { ...baseProduct, prod_id: 'open', prod_name: 'Adult Chicken Dog Food' },
    { ...baseProduct, prod_id: 'mini-bites', prod_name: 'Adult Small Bites Chicken 3Kg' },
  ]

  it('keeps only the matching breed size for a 30 kg dog', () => {
    const r = evaluate({ ...dogAdult, weight: 30 }, rows)
    const shown = [...ids(r.best), ...ids(r.other)]
    expect(shown).toContain('large')
    expect(shown).toContain('open')
    // "Small Bites" is a kibble size, not a breed size, so it stays available
    expect(shown).toContain('mini-bites')
    expect(shown).not.toContain('small')
    expect(shown).not.toContain('medium')
    expect(r.excluded.map((e) => e.id)).toEqual(expect.arrayContaining(['small', 'medium']))
  })

  it('keeps every size when the weight is unknown', () => {
    const r = evaluate(dogAdult, rows)
    const shown = [...ids(r.best), ...ids(r.other)]
    expect(shown).toEqual(expect.arrayContaining(['small', 'medium', 'large']))
    expect(r.excluded.filter((e) => e.rule === 'size')).toEqual([])
  })
})

describe('evaluate: treats rank below complete food', () => {
  it('never gives the top match to a pouch of puree', () => {
    const rows = [
      { ...baseProduct, prod_id: 'puree', prod_name: 'Adult Cat Puree Chicken 15G', category: 'cats food' },
      { ...baseProduct, prod_id: 'food', prod_name: 'Adult Cat Chicken Food 400G', category: 'cats food' },
    ]
    const r = evaluate({ ...dogAdult, species: 'cat' }, rows)
    expect(ids(r.best)[0]).toBe('food')
    expect(r.best.find((p) => p.id === 'food').topMatch).toBe(true)
    expect(r.best.find((p) => p.id === 'puree').topMatch).toBeUndefined()
  })
})

describe('evaluate: life stage', () => {
  it('shows only growth-stage or all-stage products to a puppy', () => {
    const r = evaluate({ ...dogAdult, lifeStage: 'puppy' }, sample)
    const shown = [...ids(r.best), ...ids(r.other)]
    expect(shown).toContain('puppy')
    expect(shown).not.toContain('senior')
    expect(shown).not.toContain('adult-dog')
    expect(r.excluded.filter((e) => e.rule === 'lifeStage').map((e) => e.id)).toEqual(
      expect.arrayContaining(['senior', 'adult-dog'])
    )
  })

  it('hides a food with no life stage in its name from a puppy', () => {
    const plain = { ...baseProduct, prod_id: 'plain', prod_name: 'Urinary S/O Big Dog 2kg' }
    const r = evaluate({ ...dogAdult, lifeStage: 'puppy', healthCondition: 'urinary' }, [plain])
    expect(r.best).toEqual([])
    expect(r.other).toEqual([])
    expect(r.excluded).toEqual([expect.objectContaining({ id: 'plain', rule: 'lifeStage' })])
  })

  it('still shows a stage-less food to an adult dog', () => {
    const plain = { ...baseProduct, prod_id: 'plain', prod_name: 'Urinary S/O Big Dog 2kg' }
    const r = evaluate({ ...dogAdult, healthCondition: 'urinary' }, [plain])
    expect(ids(r.best)).toEqual(['plain'])
  })

  it('never shows puppy or senior foods to an adult dog', () => {
    const r = evaluate(dogAdult, sample)
    const shown = [...ids(r.best), ...ids(r.other)]
    expect(shown).not.toContain('puppy')
    expect(shown).not.toContain('senior')
    expect(shown).toContain('adult-dog')
    expect(r.excluded.filter((e) => e.rule === 'lifeStage').map((e) => e.id)).toEqual(
      expect.arrayContaining(['puppy', 'senior'])
    )
  })

  it('never shows a puppy food to a senior dog', () => {
    const r = evaluate({ ...dogAdult, lifeStage: 'senior' }, sample)
    const shown = [...ids(r.best), ...ids(r.other)]
    expect(shown).not.toContain('puppy')
    expect(shown).not.toContain('adult-dog')
    expect(shown).toContain('senior')
  })

  it('never shows a kitten food to an adult cat', () => {
    const r = evaluate({ species: 'cat', lifeStage: 'adult', healthCondition: 'healthy', allergies: [] }, sample)
    const shown = [...ids(r.best), ...ids(r.other)]
    expect(shown).not.toContain('kitten')
    expect(shown).toContain('cat-adult')
  })

  it('hides adult-only cat food from a kitten but keeps the kitten formula', () => {
    const kitten = { species: 'cat', lifeStage: 'kitten', healthCondition: 'healthy', allergies: [] }
    const r = evaluate(kitten, sample)
    expect(ids(r.best)).toContain('kitten')
    expect(ids(r.best)).not.toContain('cat-adult')
    expect(r.excluded.map((e) => e.id)).toContain('cat-adult')
  })
})

describe('evaluate: daily life only changes the order', () => {
  const food = (id, name, extra = {}) => ({ ...baseProduct, prod_id: id, prod_name: name, ...extra })

  it('puts an energy-rich formula first for a high-activity dog', () => {
    const rows = [food('plain', 'Adult Chicken Dog Food'), food('energy', 'Adult High Energy Dog Food')]
    const r = evaluate({ ...dogAdult, activity: 'high' }, rows)
    expect(ids(r.best)).toEqual(['energy', 'plain'])
    expect(r.best[0].reasons).toContain('High-energy formula for an active dog')
  })

  it('never hides a high-energy formula from a calm dog, only warns and pushes it down', () => {
    const rows = [food('energy', 'Adult High Energy Dog Food'), food('plain', 'Adult Chicken Dog Food')]
    const r = evaluate({ ...dogAdult, activity: 'low' }, rows)
    expect(ids(r.best)).toEqual(['plain', 'energy'])
    const energy = r.best.find((p) => p.id === 'energy')
    expect(energy.warnings).toContain('High-energy formula, but your pet has low activity.')
    expect(energy.lowFit).toBe(true)
    // a poor fit never wears the badge
    expect(energy.topMatch).toBeUndefined()
    expect(r.best.find((p) => p.id === 'plain').topMatch).toBe(true)
  })

  it('checks the badge criteria on the total score, so a calm pet is never first', () => {
    const rows = [food('energy', 'Adult Performance Dog Food')]
    const r = evaluate({ ...dogAdult, activity: 'low' }, rows)
    expect(ids(r.best)).toEqual(['energy'])
    expect(r.best[0].topMatch).toBeUndefined()
  })

  it('prefers a light formula for a calm pet', () => {
    const rows = [food('plain', 'Adult Chicken Dog Food'), food('light', 'Adult Light Dog Food')]
    const r = evaluate({ ...dogAdult, activity: 'low' }, rows)
    expect(ids(r.best)).toEqual(['light', 'plain'])
    expect(r.best[0].reasons).toContain('Light formula for a less active pet')
  })

  it('gives an indoor cat the indoor and hairball bonuses', () => {
    const cat = { species: 'cat', lifeStage: 'adult', healthCondition: 'healthy', allergies: [] }
    const rows = [
      food('plain', 'Adult Cat Food', { category: 'cats food' }),
      food('indoor', 'Adult Indoor Cat Food', { category: 'cats food' }),
      food('hairball', 'Adult Hairball Cat Food', { category: 'cats food' }),
    ]
    const r = evaluate({ ...cat, activity: 'normal', environment: 'indoor' }, rows)
    expect(ids(r.best).slice(0, 2)).toEqual(['indoor', 'hairball'])
    expect(r.best.find((p) => p.id === 'indoor').reasons).toContain('Indoor formula')
    expect(r.best.find((p) => p.id === 'hairball').reasons).toContain('Hairball control')
  })

  it('does not give an indoor cat two bonuses for the same indoor rule', () => {
    const cat = { species: 'cat', lifeStage: 'adult', healthCondition: 'healthy', allergies: [] }
    const rows = [
      food('plain', 'Adult Cat Food', { category: 'cats food' }),
      food('indoor', 'Adult Indoor Cat Food', { category: 'cats food' }),
    ]
    const calmIndoor = evaluate({ ...cat, activity: 'low', environment: 'indoor' }, rows)
    const indoorOnly = evaluate({ ...cat, activity: 'normal', environment: 'indoor' }, rows)
    const gap = (r) => r.best[0].score - r.best[1].score
    expect(gap(calmIndoor)).toBe(gap(indoorOnly))
  })

  it('leaves a cat with an outdoor life alone', () => {
    const cat = { species: 'cat', lifeStage: 'adult', healthCondition: 'healthy', allergies: [] }
    const rows = [
      food('plain', 'Adult Cat Food', { category: 'cats food' }),
      food('indoor', 'Adult Indoor Cat Food', { category: 'cats food' }),
    ]
    const r = evaluate({ ...cat, activity: 'normal', environment: 'outdoor' }, rows)
    expect(r.best.find((p) => p.id === 'indoor').reasons).not.toContain('Indoor formula')
  })

  it('marks the food made for the dog\'s own breed size', () => {
    const rows = [
      food('large', 'Adult Large Breed Dog Food'),
      food('open', 'Adult Chicken Dog Food'),
    ]
    const r = evaluate({ ...dogAdult, activity: 'normal', breedSize: 'large' }, rows)
    expect(r.best.find((p) => p.id === 'large').reasons).toContain('Made for large-breed dogs')
    expect(r.best.find((p) => p.id === 'open').reasons).not.toContain('Made for large-breed dogs')
  })

  it('treats an unknown activity value as normal', () => {
    const rows = [food('energy', 'Adult High Energy Dog Food')]
    const r = evaluate({ ...dogAdult, activity: 'zoomies' }, rows)
    expect(r.best[0].warnings).toEqual([])
    expect(r.best[0].reasons).not.toContain('High-energy formula for an active dog')
  })

  it('never applies the dog and cat questions to another species', () => {
    const bird = { species: 'bird', lifeStage: 'adult', healthCondition: 'healthy', allergies: [], activity: 'low' }
    const rows = [{ ...food('seed', 'Adult High Energy Bird Food'), category: 'birds' }]
    const r = evaluate(bird, rows)
    expect(r.best[0].warnings).toEqual([])
    expect(r.best[0].lowFit).toBe(false)
  })

  it('reads a light formula without treating low calcium as low calorie', () => {
    const rows = [
      food('cal', 'Adult Low Calcium Dog Food'),
      food('light', 'Adult Low Calorie Dog Food'),
    ]
    const r = evaluate({ ...dogAdult, activity: 'low' }, rows)
    expect(r.best.find((p) => p.id === 'cal').reasons).not.toContain('Light formula for a less active pet')
    expect(r.best.find((p) => p.id === 'light').reasons).toContain('Light formula for a less active pet')
  })
})

describe('petSizeClass', () => {
  it('lets the owner\'s breed-size answer win at every age', () => {
    expect(petSizeClass({ species: 'dog', lifeStage: 'puppy', breedSize: 'large', weight: 3 }, 'puppy')).toBe('large')
    expect(petSizeClass({ species: 'dog', lifeStage: 'adult', breedSize: 'small', weight: 30 }, 'adult')).toBe('small')
  })

  it('never guesses a puppy\'s adult size from its current weight', () => {
    expect(petSizeClass({ species: 'dog', lifeStage: 'puppy', weight: 10 }, 'puppy')).toBeNull()
  })

  it('falls back to weight for a grown dog', () => {
    expect(petSizeClass({ species: 'dog', weight: 8 }, 'adult')).toBe('small')
    expect(petSizeClass({ species: 'dog', weight: 20 }, 'adult')).toBe('medium')
    expect(petSizeClass({ species: 'dog', weight: 30 }, 'adult')).toBe('large')
  })

  it('has no size line for a cat', () => {
    expect(petSizeClass({ species: 'cat', breedSize: 'large', weight: 30 }, 'adult')).toBeNull()
  })
})

describe('evaluate: determinism and sorting', () => {
  it('gives the same order no matter how the catalog is listed', () => {
    const a = evaluate(dogAdult, sample)
    const b = evaluate(dogAdult, [...sample].reverse())
    expect(ids(a.best)).toEqual(ids(b.best))
  })

  it('sorts equal scores by price, then name', () => {
    const products = [
      { ...baseProduct, prod_id: 'b', prod_name: 'Beta Adult Food', price: 200 },
      { ...baseProduct, prod_id: 'a', prod_name: 'Alpha Adult Food', price: 200 },
      { ...baseProduct, prod_id: 'c', prod_name: 'Gamma Adult Food', price: 100 },
    ]
    const r = evaluate(dogAdult, products)
    expect(ids(r.best)).toEqual(['c', 'a', 'b'])
  })
})

describe('evaluate: unknown allergy values', () => {
  it('shows a notice for an allergy that is not a known category', () => {
    const r = evaluate({ ...dogAdult, allergies: ['mystery'] }, sample)
    expect(r.notices.map((n) => n.code)).toContain('unknown-allergy')
  })

  it('never quotes the stored code, only a readable name', () => {
    const r = evaluate({ ...dogAdult, allergies: ['weird-stuff'] }, sample)
    const notice = r.notices.find((n) => n.code === 'unknown-allergy')
    expect(notice.message).toContain('Weird stuff')
    expect(notice.message).not.toContain('weird-stuff')
  })

  it('gives one notice for several unknown values, so keys stay unique', () => {
    const r = evaluate({ ...dogAdult, allergies: ['mystery', 'weird-stuff'] }, sample)
    expect(r.notices.filter((n) => n.code === 'unknown-allergy')).toHaveLength(1)
  })
})
