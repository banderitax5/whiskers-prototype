import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { useShop } from '../context/ShopContext'
import { usePets } from '../context/PetsContext'
import { recommendFromCatalog } from '../lib/recommendEngine'
import { logTopRecommendation } from '../lib/recommendationLogger'
import { apiGet } from '../lib/api'
import { findLabel, HEALTH_CONDITION_OPTIONS } from '../data/petFormOptions'

// catalog is refetched on a short TTL so admin price/stock edits show up
// without hammering the API on every pet-tab switch
let catalogCache = { at: 0, items: null }
async function loadCatalog() {
  if (catalogCache.items && Date.now() - catalogCache.at < 60_000) {
    return catalogCache.items
  }
  const res = await apiGet('/products?pageSize=1000')
  const items = res.items || []
  catalogCache = { at: Date.now(), items }
  return items
}

function RecommendationResults({ pet }) {
  const { addToCart } = useShop()
  const { isAuthenticated } = usePets()
  const [catalog, setCatalog] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const loggedKeyRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(false)
    loadCatalog()
      .then((items) => { if (!cancelled) setCatalog(items) })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [attempt])

  const { items: recommendations, matchedCondition } = useMemo(
    () => recommendFromCatalog(pet, catalog || []),
    [pet, catalog]
  )

  // one log per pet+top-product pair so flipping tabs doesn't spam the table
  useEffect(() => {
    if (!isAuthenticated || !pet || recommendations.length === 0) return
    const topProduct = recommendations[0]
    const dedupeKey = `${pet.id}:${topProduct.prod_id}`
    if (loggedKeyRef.current === dedupeKey) return
    loggedKeyRef.current = dedupeKey

    logTopRecommendation({ pet, topProduct })
  }, [pet, recommendations, isAuthenticated])

  const retry = useCallback(() => {
    catalogCache = { at: 0, items: null }
    setAttempt((a) => a + 1)
  }, [])

  if (!pet) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center dark:bg-gray-800 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">Select a pet to see tailored food recommendations.</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center dark:bg-red-900/30 dark:border-red-800">
        <h3 className="font-semibold text-red-900 mb-1 dark:text-red-200">Could not load the product catalog</h3>
        <p className="text-sm text-red-700 mb-4 dark:text-red-300">Check your connection and try again.</p>
        <button
          type="button"
          onClick={retry}
          className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (catalog === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700 p-4 space-y-3">
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        ))}
        <span role="status" className="sr-only">Loading recommendations...</span>
      </div>
    )
  }

  const healthLabel = findLabel(HEALTH_CONDITION_OPTIONS, pet.healthCondition)

  if (recommendations.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 dark:bg-amber-900/20 dark:border-amber-800">
        <h3 className="font-semibold text-amber-900 mb-1 dark:text-amber-200">No matching products yet</h3>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          We could not find an in-stock, priced product in our current catalog that matches {pet.name}&apos;s
          species and health profile. We recommend consulting your veterinarian directly.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-[#0b2e59] to-[#134680] text-white rounded-xl p-5">
        <h2 className="text-lg sm:text-xl font-semibold">
          Recommended for {pet.name}
        </h2>
        <p className="text-sm text-white/80 mt-1">
          {recommendations.length} product{recommendations.length === 1 ? '' : 's'} tailored to a{' '}
          <span className="font-medium">{pet.lifeStage} {pet.species}</span> with{' '}
          <span className="font-medium">{healthLabel.toLowerCase()}</span>
        </p>
      </div>

      {!matchedCondition && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
          <strong>Heads up:</strong> no condition-specific formula for {healthLabel.toLowerCase()} is
          in stock right now, so these are general foods. Confirm with your vet before switching diets.
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-400 rounded-lg p-4 text-xs text-blue-900 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-100">
        <strong>Note:</strong> These recommendations are generated from a rule-based engine matching
        species, life stage, and declared health conditions. They are not a substitute for
        professional veterinary advice.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recommendations.map((product, index) => (
          <article
            key={product.prod_id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700"
          >
            <div className="relative aspect-square bg-gray-50 overflow-hidden dark:bg-gray-700/50">
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                className="w-full h-full object-contain p-2"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              {index === 0 && (
                <span className="absolute top-2 left-2 bg-[#dbb727] text-[#0b2e59] text-xs font-bold px-2 py-1 rounded-full">
                  TOP MATCH
                </span>
              )}
            </div>

            <div className="p-4 flex-1 flex flex-col">
              <div className="text-xs text-gray-500 uppercase tracking-wide dark:text-gray-400">{product.brand}</div>
              <h3 className="font-semibold text-gray-900 mt-0.5 mb-1.5 line-clamp-2 dark:text-white">
                {product.name}
              </h3>

              {product.reasons && product.reasons.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {product.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                      <span className="mt-0.5">&#10003;</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                <span className="font-bold text-[#0b2e59] dark:text-blue-400">&#8369;{product.price.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => addToCart(product, 1)}
                  className="px-3 py-1.5 rounded-lg bg-[#dbb727] hover:bg-[#c9a820] text-[#0b2e59] text-xs font-semibold transition-colors"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export default RecommendationResults
