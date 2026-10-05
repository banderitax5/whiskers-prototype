import { describe, it, expect } from 'vitest'
import { speciesFor, deriveProfile, recommendFromCatalog } from './recommendEngine'

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
