import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { usePets } from '../context/PetsContext'
import { loadCatalog } from '../lib/catalogCache'
import { pickCartRecommendations } from '../lib/cartRecommendations'
import { formatPesos } from '../lib/cartLogic'
import { toCartPayload } from '../lib/productDisplay'
import ProductThumb from './ProductThumb'

// "You may also like" strip under the cart items. Purely an enhancement: any
// fetch failure or empty result renders nothing and never blocks the cart.
export default function CartRecommendations() {
  const { cartItems, addToCart } = useShop()
  const { getActivePet, isAuthenticated } = usePets()
  const [rows, setRows] = useState(null)

  const hasItems = cartItems.length > 0

  useEffect(() => {
    let alive = true
    if (!hasItems) {
      setRows(null)
      return undefined
    }
    loadCatalog()
      .then((items) => { if (alive) setRows(items) })
      .catch(() => { if (alive) setRows(null) })
    return () => { alive = false }
  }, [hasItems])

  const pet = isAuthenticated ? getActivePet() : null
  const recs = useMemo(
    () => (rows ? pickCartRecommendations(rows, cartItems, pet) : []),
    [rows, cartItems, pet],
  )

  if (recs.length === 0) return null

  return (
    <section aria-labelledby="cart-recs-heading" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <h2 id="cart-recs-heading" className="text-base font-bold text-gray-800 dark:text-gray-100">
        {pet ? `Recommended for ${pet.name}` : 'You may also like'}
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {recs.map((p) => (
          <li key={p.id} className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <Link
              to={`/products/${p.id}`}
              className="flex flex-col items-center text-center focus:outline-none focus:ring-2 focus:ring-[#0b2e59] rounded-lg"
            >
              <ProductThumb
                src={p.image}
                className="h-24 w-full"
                imgClassName="h-20 w-20"
              />
              <span className="mt-2 line-clamp-2 min-h-[2rem] text-xs font-medium text-gray-700 dark:text-gray-200" title={p.name}>
                {p.name}
              </span>
            </Link>
            <div className="mt-auto flex items-center justify-between gap-2 pt-3">
              <span className="text-sm font-bold text-[#0b2e59] dark:text-yellow-300">
                PHP {formatPesos(Number(p.price))}
              </span>
              <button
                type="button"
                onClick={() => addToCart(toCartPayload(p), 1)}
                aria-label={`Add ${p.name} to cart`}
                className="min-h-[44px] rounded-lg bg-[#0b2e59] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#15407a]"
              >
                Add
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
