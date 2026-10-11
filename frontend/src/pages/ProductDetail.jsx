import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import supabase from '../lib/supabase'
import { apiGet } from '../lib/api.js'
import { trackEvent } from '../lib/appEvents.js'
import { setProductSeo } from '../lib/seo.js'
import ProductImage from '../components/ProductImage.jsx'
import ProductCard from '../components/ProductCard.jsx'
import ProductInfoAccordion from '../components/ProductInfoAccordion.jsx'
import { normalizeProduct, formatPrice, getStockStatus, toCartPayload } from '../lib/productDisplay.js'
import { parseDetails } from '../lib/productInfo.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Breadcrumbs({ product }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 sm:mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <li><Link to="/" className="hover:text-[#0b2e59] dark:hover:text-blue-400">Home</Link></li>
        <li aria-hidden="true">/</li>
        <li><Link to="/menu" className="hover:text-[#0b2e59] dark:hover:text-blue-400">Products</Link></li>
        {product?.category && (
          <>
            <li aria-hidden="true">/</li>
            <li>
              <Link to={`/menu?category=${encodeURIComponent(product.category)}`} className="hover:text-[#0b2e59] dark:hover:text-blue-400">
                {product.category}
              </Link>
            </li>
          </>
        )}
        <li aria-hidden="true">/</li>
        <li className="text-gray-700 dark:text-gray-200 font-medium truncate max-w-[50vw] sm:max-w-xs" aria-current="page">
          {product?.name}
        </li>
      </ol>
    </nav>
  )
}

function Skeleton() {
  return (
    <div className="w-full lg:mx-auto lg:max-w-7xl py-6 sm:py-8" aria-hidden="true">
      <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-64 sm:h-96 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="space-y-3">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-6" />
        </div>
      </div>
      <span role="status" className="sr-only">Loading product...</span>
    </div>
  )
}

function NotFoundBlock() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <h1 className="text-6xl sm:text-7xl font-extrabold text-[#0b2e59] dark:text-white">404</h1>
      <div className="mt-4 mb-2 w-16 h-1 rounded-full bg-[#ffd21e]" />
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mt-2">Product not found</h2>
      <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-md">
        This product doesn&apos;t exist or is no longer available.
      </p>
      <Link
        to="/menu"
        className="mt-8 inline-flex items-center gap-2 h-11 px-8 rounded-lg bg-[#0b2e59] text-white font-semibold hover:bg-[#1f4db8] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Products
      </Link>
    </div>
  )
}

function ErrorBlock({ onRetry }) {
  return (
    <div className="w-full lg:mx-auto lg:max-w-7xl py-6 sm:py-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center dark:bg-red-900/30 dark:border-red-800">
        <h2 className="font-semibold text-red-900 dark:text-red-200 mb-1">Could not load product</h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">Check your connection and try again.</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

function ProductDetail() {
  const { prod_id } = useParams()
  const { addToCart } = useShop()

  const validId = UUID_RE.test(String(prod_id || ''))
  const [status, setStatus] = useState(validId ? 'loading' : 'notfound') // loading | ready | notfound | error
  const [item, setItem] = useState(null)
  const [related, setRelated] = useState([])
  const [qty, setQty] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [recoNote, setRecoNote] = useState(null)
  const trackedRef = useRef(null)

  const load = useCallback(async () => {
    if (!validId) { setStatus('notfound'); return }
    setStatus('loading')
    try {
      const data = await apiGet(`/products/${prod_id}`)
      setItem(data.item)
      setRelated(data.related || [])
      setStatus('ready')
    } catch (err) {
      // a 404 (missing or inactive) is a not-found page, not an error state
      if (err?.status === 404) { setStatus('notfound'); return }
      setStatus('error')
    }
  }, [prod_id, validId])

  useEffect(() => { load() }, [load, attempt])

  const p = status === 'ready' ? normalizeProduct(item) : null
  // deep-dive sections (ingredients, feeding guide, ...) - empty for products
  // that carry none, in which case the accordion is not rendered at all
  const infoSections = status === 'ready' ? parseDetails(item?.details) : []

  // per-product SEO meta; restores site defaults on unmount / product change
  useEffect(() => {
    if (status !== 'ready' || !p) return undefined
    return setProductSeo(p)
  }, [status, p])

  // fire a product_view event once per product load, following the same
  // tracking convention the quick view modal already uses
  useEffect(() => {
    if (status !== 'ready' || !p) return
    if (trackedRef.current === p.prod_id) return
    trackedRef.current = p.prod_id
    trackEvent('product_view', { product_id: p.prod_id, name: p.name, price: p.price })
  }, [status, p])

  // optional: if the signed-in user has a recommendation row for this product,
  // surface the condition it was suggested for. Uses existing RLS (own rows only).
  useEffect(() => {
    let cancelled = false
    if (status !== 'ready' || !p) return undefined
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      const { data } = await supabase
        .from('recommendation')
        .select('pet_condition')
        .eq('prod_id', p.prod_id)
        .limit(1)
        .maybeSingle()
      if (!cancelled && data?.pet_condition) setRecoNote(data.pet_condition)
    })()
    return () => { cancelled = true }
  }, [status, p])

  // reset qty when the product changes
  useEffect(() => { setQty(1) }, [prod_id])

  if (status === 'loading') return <Skeleton />
  if (status === 'notfound') return <NotFoundBlock />
  if (status === 'error') return <ErrorBlock onRetry={() => setAttempt((a) => a + 1)} />
  if (!p) return <NotFoundBlock />

  const { inStock, lowStock, stock, hasStockInfo } = getStockStatus(item?.stock_quantity)
  const priceLabel = formatPrice(p.price)
  const purchasable = p.price > 0 && inStock
  const maxQty = hasStockInfo && stock > 0 ? stock : Infinity
  const increase = () => setQty((v) => Math.min(maxQty, v + 1))
  const decrease = () => setQty((v) => Math.max(1, v - 1))

  return (
    <div className="w-full lg:mx-auto lg:max-w-7xl py-6 sm:py-8">
      <Breadcrumbs product={p} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* main product image */}
        <ProductImage
          src={p.image}
          alt={p.name}
          className="rounded-xl border border-gray-200 dark:border-gray-600 p-4 h-64 sm:h-96"
          imgClassName="max-h-full w-full"
          loading="eager"
        />

        {/* details */}
        <div className="flex flex-col">
          {p.brand && (
            <span className="text-xs font-semibold text-[#0b2e59] dark:text-blue-400 uppercase tracking-wider">{p.brand}</span>
          )}
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{p.name}</h1>

          {p.category && (
            <Link
              to={`/menu?category=${encodeURIComponent(p.category)}`}
              className="mt-1 inline-flex w-fit items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-[#0b2e59] dark:hover:text-blue-400"
            >
              {p.category}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          )}

          {priceLabel ? (
            <p className="mt-3 text-3xl font-bold text-[#e4406a]">{priceLabel}</p>
          ) : (
            <p className="mt-3 text-lg font-semibold text-gray-500 dark:text-gray-400">Price not yet set</p>
          )}

          {hasStockInfo && (
            <p className={`mt-1 text-sm font-semibold ${!inStock ? 'text-red-600 dark:text-red-400' : lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
              {!inStock ? 'Out of stock' : lowStock ? `Only ${stock} left in stock` : 'In stock'}
            </p>
          )}

          {/* optional personalization note from the user's own recommendation row */}
          {recoNote && (
            <p className="mt-3 inline-flex w-fit items-start gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              <svg className="mt-0.5 w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              <span>Recommended for your pet&apos;s condition: <strong>{recoNote}</strong></span>
            </p>
          )}

          {/* description, only when the schema actually carries one */}
          {p.description && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Description</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{p.description}</p>
            </div>
          )}

          {/* quantity stepper */}
          <div className="mt-5 flex items-center gap-1">
            <span id="qty-label" className="sr-only">Quantity</span>
            <button
              type="button"
              onClick={decrease}
              disabled={qty <= 1}
              aria-label="Decrease quantity"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-lg font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >-</button>
            <output
              aria-labelledby="qty-label"
              className="flex h-10 min-w-[48px] items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-3 text-sm font-semibold text-gray-800 dark:text-gray-100"
            >{qty}</output>
            <button
              type="button"
              onClick={increase}
              disabled={qty >= maxQty}
              aria-label="Increase quantity"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-lg font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >+</button>
            {hasStockInfo && stock > 0 && stock <= 5 && (
              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">Max {stock}</span>
            )}
          </div>

          {/* add to cart — same ShopContext.addToCart the modal uses, so the
              cart_items row (product_id column) is identical */}
          <button
            type="button"
            disabled={!purchasable}
            onClick={() => addToCart(toCartPayload(item), qty)}
            className="mt-4 h-12 rounded-lg bg-yellow-400 text-sm font-bold text-gray-900 transition hover:bg-yellow-500 active:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {purchasable ? 'Add to Cart' : 'Unavailable'}
          </button>
        </div>
      </div>

      {/* detailed product information: ingredients, feeding guide, etc. */}
      {infoSections.length > 0 && (
        <section className="mt-8 sm:mt-10" aria-labelledby="product-info-heading">
          <h2 id="product-info-heading" className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
            Product information
          </h2>
          <div className="mt-3">
            <ProductInfoAccordion sections={infoSections} />
          </div>
        </section>
      )}

      {/* related products */}
      {related.length > 0 && (
        <section className="mt-10 sm:mt-14" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">Related products</h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.prod_id} product={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default ProductDetail
