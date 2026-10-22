// pure ranking helpers for the "You may also like" strip on the cart page.
// everything offered there must be purchasable and not already in the cart,
// because the add button would otherwise fail server-side or duplicate a row.
// ordering: pet-engine matches first (same engine the /pets page uses), then
// rows sharing a category or brand with what is already in the cart, then the
// remaining purchasable catalog as a last resort.

import { isPurchasable, normalizeProduct } from './productDisplay'
import { recommendFromCatalog } from './recommendEngine'

function affinityKey(value) {
  return (value || '').trim().toLowerCase()
}

export function pickCartRecommendations(catalog, cartItems, pet, limit = 4) {
  const inCart = new Set((cartItems || []).map((i) => i?.id).filter(Boolean))
  const pool = (catalog || [])
    .map(normalizeProduct)
    .filter((p) => p && p.id && !inCart.has(p.id))
    .filter((p) => p.is_active !== false)
    .filter((p) => (p.category || '').toLowerCase() !== 'test')
    .filter((p) => isPurchasable(p))

  if (pool.length === 0) return []

  const picked = []
  const seen = new Set()
  const take = (p) => {
    if (p && !seen.has(p.id) && picked.length < limit) {
      seen.add(p.id)
      picked.push(p)
    }
  }

  if (pet) {
    const { items } = recommendFromCatalog(pet, pool)
    const byId = new Map(pool.map((p) => [p.id, p]))
    for (const item of items) take(byId.get(item.id) || byId.get(item.prod_id))
  }

  if (picked.length < limit) {
    const cartCats = new Set((cartItems || []).map((i) => affinityKey(i?.collection)))
    const cartBrands = new Set((cartItems || []).map((i) => affinityKey(i?.brand)))
    for (const p of pool) {
      if (cartCats.has(affinityKey(p.category))) take(p)
    }
    for (const p of pool) {
      if (cartBrands.has(affinityKey(p.brand))) take(p)
    }
  }

  if (picked.length < limit) {
    for (const p of pool) take(p)
  }

  return picked
}
