import { useMemo } from 'react'
import { useShop } from '../context/ShopContext'
import { recommendFor } from '../data/petFoodCatalog'
import { findLabel, HEALTH_CONDITION_OPTIONS } from '../data/petFormOptions'

// shows the ranked list of recommended products for a given pet profile
// runs the scoring engine and displays each product with the reasons it matched
// also includes a small "no results" state for edge cases
function RecommendationResults({ pet }) {
  const { addToCart } = useShop()

  const recommendations = useMemo(() => recommendFor(pet), [pet])

  if (!pet) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Select a pet to see tailored food recommendations.</p>
      </div>
    )
  }

  const healthLabel = findLabel(HEALTH_CONDITION_OPTIONS, pet.healthCondition)

  if (recommendations.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <h3 className="font-semibold text-amber-900 mb-1">No matching products yet</h3>
        <p className="text-sm text-amber-800">
          We could not find a product in our current catalog that is safe for {pet.name} given their
          health condition and allergies. We recommend consulting your veterinarian directly, or
          trying fewer allergy filters.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recommendations.map((product, index) => (
          <article
            key={product.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow dark:bg-gray-800"
          >
            <div className="relative aspect-square bg-gray-50 overflow-hidden">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
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
              <div className="text-xs text-gray-500 uppercase tracking-wide dark:text-white">{product.brand}</div>
              <h3 className="font-semibold text-gray-900 mt-0.5 mb-1.5 line-clamp-2 dark:text-white">
                {product.name}
              </h3>
              <p className="text-xs text-gray-600 line-clamp-2 mb-3 dark:text-gray-400">{product.description}</p>

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

              <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="font-bold text-[#0b2e59] dark:text-blue-500">&#8369;{product.price.toLocaleString()}</span>
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

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-900">
        <strong>Note:</strong> These recommendations are generated from a rule-based engine matching
        species, life stage, and declared health conditions. They are not a substitute for
        professional veterinary advice.
      </div>
    </div>
  )
}

export default RecommendationResults
