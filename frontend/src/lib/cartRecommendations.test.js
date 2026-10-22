import { describe, it, expect } from 'vitest'
import { pickCartRecommendations } from './cartRecommendations'

function row(prod_id, prod_name, extra = {}) {
  return {
    prod_id,
    prod_name,
    price: 100,
    stock_quantity: 10,
    is_active: true,
    category: 'dogs - dry',
    brand: 'Royal Canin',
    image_url: '',
    ...extra,
  }
}

const DOG_PET = { species: 'dog', lifeStage: 'adult', healthCondition: 'healthy' }

describe('pickCartRecommendations', () => {
  it('returns an empty list when nothing is purchasable', () => {
    const catalog = [
      row('a', 'No price', { price: 0 }),
      row('b', 'Out of stock', { stock_quantity: 0 }),
      row('c', 'Inactive', { is_active: false }),
      row('d', 'Test row', { category: 'test' }),
    ]
    expect(pickCartRecommendations(catalog, [], null)).toEqual([])
    expect(pickCartRecommendations([], [], DOG_PET)).toEqual([])
  })

  it('never recommends items already in the cart', () => {
    const catalog = [row('a', 'Alpha'), row('b', 'Beta')]
    const cartItems = [{ id: 'a', collection: 'dogs - dry', brand: 'Royal Canin' }]
    const out = pickCartRecommendations(catalog, cartItems, null)
    expect(out.map((p) => p.id)).toEqual(['b'])
  })

  it('ranks pet-engine matches first when a pet profile exists', () => {
    const catalog = [
      row('cat-food', 'Cat Kibble', { category: 'cats - dry', brand: 'Aozi' }),
      row('dog-food', 'Dog Kibble', { category: 'dogs - dry', brand: 'Aozi' }),
      row('fish-food', 'Fish Flakes', { category: 'fish', brand: 'Vitality' }),
    ]
    const out = pickCartRecommendations(catalog, [], DOG_PET, 3)
    // dog product first (species match); cat/fish rows only fill remaining slots
    expect(out[0].id).toBe('dog-food')
    expect(out).toHaveLength(3)
  })

  it('falls back to same-category then same-brand affinity without a pet', () => {
    const catalog = [
      row('unrelated', 'Bird Seed', { category: 'birds', brand: 'Aozi' }),
      row('same-brand', 'Other Royal', { category: 'cats - dry', brand: 'Royal Canin' }),
      row('same-cat', 'Another Dry', { category: 'DOGS - DRY', brand: 'Top Breed' }),
    ]
    const cartItems = [{ id: 'cart-item', collection: 'dogs - dry', brand: 'royal canin' }]
    const out = pickCartRecommendations(catalog, cartItems, null, 3)
    // category and brand matching is case-insensitive
    expect(out.map((p) => p.id)).toEqual(['same-cat', 'same-brand', 'unrelated'])
  })

  it('respects the limit and never emits duplicates', () => {
    const catalog = [row('a', 'A'), row('b', 'B'), row('c', 'C'), row('d', 'D'), row('e', 'E')]
    const out = pickCartRecommendations(catalog, [], DOG_PET, 4)
    expect(out).toHaveLength(4)
    expect(new Set(out.map((p) => p.id)).size).toBe(4)
  })
})
