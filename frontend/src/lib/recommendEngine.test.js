import { describe, it, expect } from 'vitest'
import { speciesFor, deriveProfile, recommendFromCatalog, evaluate } from './recommendEngine'

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
    expect(items[0].reasons.join(' ')).toContain('General formula while condition-specific options are out of stock')
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
})

describe('evaluate: therapeutic gating', () => {
  it('hides condition-specific foods from a healthy adult dog', () => {
    const r = evaluate(dogAdult, sample)
    expect(ids(r.best)).not.toEqual(expect.arrayContaining(['renal', 'renal-uro', 'diabetic', 'dental']))
    expect(r.excluded.filter((e) => e.rule === 'therapeutic').map((e) => e.id)).toEqual(
      expect.arrayContaining(['renal', 'renal-uro', 'diabetic', 'dental'])
    )
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
    expect(r.other[0].reasons).toContain('General formula while condition-specific options are out of stock')
    expect(r.notices.map((n) => n.code)).toContain('no-condition-match')
    expect(r.matchedCondition).toBe(false)
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
})
