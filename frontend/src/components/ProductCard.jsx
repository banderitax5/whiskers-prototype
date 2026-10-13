import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import ProductImage from './ProductImage.jsx'
import { normalizeProduct, formatPrice, getStockStatus, toCartPayload } from '../lib/productDisplay.js'
import { saleFor, useActivePromos } from '../lib/promoDisplay.js'

// compact product card used by the "Related products" strip on the detail page.
// Reuses the same image fallback, price format, stock logic, and cart payload as
// the quick view modal and detail page so nothing is duplicated. Clicking the
// card (or its image/title) navigates to that product's detail page.
function ProductCard({ product }) {
  const navigate = useNavigate()
  const { addToCart } = useShop()
  const promos = useActivePromos()
  const p = normalizeProduct(product)
  const { inStock, lowStock, stock } = getStockStatus(product?.stock_quantity)
  const priceLabel = formatPrice(p.price)
  const sale = saleFor(p, promos)
  const purchasable = p.price > 0 && inStock

  function go() { navigate(`/products/${p.prod_id}`) }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } }}
      className="group cursor-pointer rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition overflow-hidden"
    >
      <ProductImage
        src={p.image}
        alt={p.name}
        className="h-24 sm:h-36"
        imgClassName="max-h-full max-w-full p-1.5 sm:p-2 group-hover:scale-105 transition"
      />
      <div className="p-2 sm:p-4">
        {p.brand && (
          <span className="inline-block text-[9px] sm:text-[10px] font-semibold text-[#0b2e59] dark:text-blue-400 uppercase tracking-wider mb-0.5 sm:mb-1">{p.brand}</span>
        )}
        <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem]">
          {p.name}
        </h3>
        {p.category && (
          <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 truncate">{p.category}</p>
        )}
        {priceLabel ? (
          sale ? (
            <p className="mt-1 sm:mt-2 text-sm sm:text-base font-bold">
              <span className="text-gray-400 dark:text-gray-500 line-through font-normal mr-1.5">{priceLabel}</span>
              <span className="text-red-600 dark:text-red-400">{formatPrice(sale.salePrice)}</span>
              <span className="ml-1.5 inline-block rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white align-middle">Sale −{sale.discountPct}%</span>
            </p>
          ) : (
            <p className="mt-1 sm:mt-2 text-sm sm:text-base font-bold text-gray-900 dark:text-white">{priceLabel}</p>
          )
        ) : (
          <p className="mt-1 sm:mt-2 text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">Price not yet set</p>
        )}
        {!inStock ? (
          <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Out of stock</span>
        ) : lowStock ? (
          <span className="mt-1 inline-block text-[10px] font-semibold text-amber-600 dark:text-amber-400">Only {stock} left</span>
        ) : null}
        <button
          type="button"
          disabled={!purchasable}
          onClick={(e) => { e.stopPropagation(); addToCart(toCartPayload(product)) }}
          className="mt-2 sm:mt-3 w-full h-8 sm:h-9 rounded-lg bg-yellow-400 px-1.5 sm:px-2 text-[10px] sm:text-xs font-semibold text-gray-900 hover:bg-yellow-500 active:bg-yellow-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {p.price > 0 ? 'Add to Cart' : 'Unavailable'}
        </button>
      </div>
    </article>
  )
}

export default ProductCard
