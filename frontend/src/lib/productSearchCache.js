import { apiGet } from './api'

// module-level cache so SearchSuggestions and MobileSearch share one
// /products fetch instead of each pulling ~500 rows on every mount
// (both components are mounted at once in the Navbar, one hidden per breakpoint)
const TTL_MS = 5 * 60 * 1000

let cached = null
let fetchedAt = 0
let inflight = null

export function getCachedProducts() {
  if (cached && Date.now() - fetchedAt < TTL_MS) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = apiGet('/products?pageSize=500')
    .then(({ items }) => {
      cached = items || []
      fetchedAt = Date.now()
      inflight = null
      return cached
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}
