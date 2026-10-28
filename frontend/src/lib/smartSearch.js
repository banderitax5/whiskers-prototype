// Natural-language search helpers. The AI (backend /products/parse-search)
// only turns a sentence into criteria. Matching stays in recommendEngine.js.
import { apiPost } from './api'
import { recommendFromCatalog } from './recommendEngine'

// Only plain sentences go to the AI: several words, not a brand or one keyword.
export function looksLikeSentence(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  return words.length >= 3
}

// Ask the backend for criteria. Never throws: any failure gives null.
export async function parseSearch(query) {
  try {
    const data = await apiPost('/products/parse-search', { query })
    return data?.criteria || null
  } catch {
    return null
  }
}

// Criteria -> the pet shape recommendEngine.js already understands.
export function criteriaToPet(criteria) {
  return {
    species: criteria.species,
    lifeStage: criteria.lifeStage,
    healthCondition: criteria.condition,
    allergies: criteria.allergies || [],
  }
}

// Runs the deterministic engine on the criteria. Returns the matched products
// (in the same shape as the catalog rows) or null when there is no species to
// match on, so the caller can fall back to plain search.
export function smartSearchProducts(criteria, products) {
  if (!criteria || !criteria.species) return null
  const { items } = recommendFromCatalog(criteriaToPet(criteria), products)
  if (items.length === 0) return []
  const byId = new Map(products.map((p) => [p.prod_id, p]))
  return items.map((item) => byId.get(item.prod_id)).filter(Boolean)
}
