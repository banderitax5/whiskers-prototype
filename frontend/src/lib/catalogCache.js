import { apiGet } from './api'

// shared 60s in-memory cache of the full product catalog, used by the pet
// recommendation page and the cart recommendation strip so moving between
// them does not refetch the same payload on every mount
let cache = { at: 0, items: null }

export async function loadCatalog() {
  if (cache.items && Date.now() - cache.at < 60_000) {
    return cache.items
  }
  const res = await apiGet('/products?pageSize=1000')
  const items = res.items || []
  cache = { at: Date.now(), items }
  return items
}

// force the next loadCatalog() to hit the API again (retry buttons, tests)
export function resetCatalogCache() {
  cache = { at: 0, items: null }
}
