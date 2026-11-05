import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { usePets } from '../context/PetsContext'
import { evaluate } from '../lib/recommendEngine'
import { logTopRecommendation } from '../lib/recommendationLogger'
import { loadCatalog, resetCatalogCache } from '../lib/catalogCache'
import { getStockStatus, useLowStockThreshold } from '../lib/productDisplay'
import {
  findLabel,
  HEALTH_CONDITION_OPTIONS,
  SPECIES_OPTIONS,
  getLifeStageOptions,
} from '../data/petFormOptions'
import ProductQuickViewDialog from './ProductQuickViewDialog.jsx'

const PAGE_SIZES = [8, 16, 24, 36]

function noticeClass(code) {
  return code === 'label-check'
    ? 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
    : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200'
}

// page numbers with "..." gaps, same rule as the Menu page
function pageNumbersFor(current, totalPages) {
  const pages = []
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
    return pages
  }
  pages.push(1)
  let start = Math.max(2, current - 1)
  let end = Math.min(totalPages - 1, current + 1)
  if (current <= 2) end = Math.min(4, totalPages - 1)
  if (current >= totalPages - 1) start = Math.max(totalPages - 3, 2)
  if (start > 2) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < totalPages - 1) pages.push('...')
  pages.push(totalPages)
  return pages
}

// the quick view dialog reads the same fields as a catalog row
function toDialogProduct(item) {
  return {
    ...item,
    prod_id: item.prod_id,
    prod_name: item.name,
    image_url: item.image,
    category: item.collection,
    stock_quantity: item.stock,
  }
}

// prices keep the short peso mark so the card footer fits a phone, but always
// carry thousands separators and never a dangling decimal ("₱1,200" but
// "₱1,200.50"), so a shopper never misreads the amount
function pesoLabel(price) {
  const n = Number(price)
  if (!Number.isFinite(n)) return null
  const decimals = Number.isInteger(n) ? 0 : 2
  return `₱${n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

// every card carries a short vet note. A pet with a condition or an allergy gets
// the stronger wording, because changing its food is a medical decision
function vetNoteFor(atRisk) {
  return atRisk ? 'Ask your vet before switching.' : 'Ask your vet if unsure about switching.'
}

// the cart only needs these fields. Works for a recommendation item and for the
// dialog copy of it (the dialog copy spreads the item, so the same names exist)
function toCartItem(p) {
  return {
    id: p.prod_id,
    name: p.name,
    price: p.price,
    image: p.image || '',
    collection: p.collection || '',
    brand: p.brand || '',
  }
}

function ProductCard({ product, topMatch, lowStockThreshold, vetNote, onOpen, onAddToCart }) {
  const { stock, hasStockInfo, inStock, lowStock } = getStockStatus(product.stock, lowStockThreshold)
  const priceLabel = pesoLabel(product.price)
  const stockText = !hasStockInfo
    ? null
    : !inStock
      ? 'Out of stock'
      : lowStock
        ? `Only ${stock} left in stock`
        : 'In stock'
  const stockClass = !inStock
    ? 'font-semibold text-red-600 dark:text-red-400'
    : lowStock
      ? 'font-semibold text-amber-600 dark:text-amber-400'
      : 'text-emerald-700 dark:text-emerald-400'

  return (
    <article
      onClick={() => onOpen(product)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="relative h-36 overflow-hidden bg-gray-50 sm:h-40 dark:bg-gray-700/50">
        {product.image && (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-2 transition group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        {topMatch && (
          <span className="absolute left-2 top-2 rounded-full bg-[#dbb727] px-2 py-0.5 text-[10px] font-bold text-[#0b2e59]">
            TOP MATCH
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="truncate text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{product.brand}</div>
        <h4 className="mb-1 mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
          {/* a real button so keyboard users can open the quick view too */}
          <button
            type="button"
            className="line-clamp-2 text-left hover:text-[#0b2e59] hover:underline dark:hover:text-blue-400"
          >
            {product.name}
          </button>
        </h4>

        {product.reasons && product.reasons.length > 0 && (
          <ul className="mb-1.5 space-y-0.5">
            {product.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                <span aria-hidden="true">&#10003;</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {product.warnings && product.warnings.length > 0 && (
          <ul className="mb-2 space-y-0.5">
            {product.warnings.map((warning, i) => (
              <li key={i} className="text-[11px] text-amber-800 dark:text-amber-300">{warning}</li>
            ))}
          </ul>
        )}

        <div className="mt-auto space-y-1.5 border-t border-gray-100 pt-2 dark:border-gray-700">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#0b2e59] dark:text-blue-400">
              {priceLabel || 'Price not set'}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddToCart(product, 1) }}
              aria-label={`Add ${product.name} to cart`}
              className="rounded-lg bg-[#dbb727] px-2.5 py-1.5 text-xs font-semibold text-[#0b2e59] transition-colors hover:bg-[#c9a820]"
            >
              Add to Cart
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className={stockClass}>
              {stockText}
            </span>
            <Link
              to={`/products/${product.prod_id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-[#0b2e59] hover:underline dark:text-blue-400"
            >
              View details
            </Link>
          </div>

          <p className="text-[10px] text-gray-500 dark:text-gray-400">{vetNote}</p>
        </div>
      </div>
    </article>
  )
}

function RecommendationResults({ pet }) {
  const { addToCart } = useShop()
  const { isAuthenticated } = usePets()
  const navigate = useNavigate()
  const lowStockThreshold = useLowStockThreshold()
  const [catalog, setCatalog] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [quickItem, setQuickItem] = useState(null)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  // the page is remembered together with the pet it belongs to, so switching
  // pets starts again on page 1 without an extra effect
  const [pager, setPager] = useState({ petKey: null, page: 1 })

  const loggedKeyRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(false)
    loadCatalog()
      .then((items) => { if (!cancelled) setCatalog(items) })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [attempt])

  const evaluation = useMemo(
    () => evaluate(pet, catalog || []),
    [pet, catalog]
  )
  const { best, other, excluded, notices } = evaluation
  // best matches first, then general options: the top item is the one logged
  const recommendations = useMemo(() => [...best, ...other], [best, other])

  const petKey = pet ? pet.id ?? pet.name ?? 'pet' : null
  const totalPages = Math.max(1, Math.ceil(recommendations.length / pageSize))
  const currentPage = pager.petKey === petKey ? pager.page : 1
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageItems = useMemo(
    () => recommendations.slice(pageStart, pageStart + pageSize),
    [recommendations, pageStart, pageSize]
  )

  // split the page into runs of one section each, so every run gets its heading
  const runs = []
  pageItems.forEach((item, i) => {
    const entry = { item, index: pageStart + i }
    const last = runs[runs.length - 1]
    if (last && last.section === item.section) last.entries.push(entry)
    else runs.push({ section: item.section, entries: [entry] })
  })

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
    resetCatalogCache()
    setAttempt((a) => a + 1)
  }, [])

  const quickProduct = useMemo(() => (quickItem ? toDialogProduct(quickItem) : null), [quickItem])

  function goToPage(n) {
    setPager({ petKey, page: n })
  }

  function changePageSize(n) {
    setPageSize(n)
    setPager({ petKey, page: 1 })
  }

  function addItem(p, qty) {
    addToCart(toCartItem(p), qty)
  }

  function buyNow(p, qty) {
    addItem(p, qty)
    navigate('/cart')
  }

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="h-36 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
        <span role="status" className="sr-only">Loading recommendations...</span>
      </div>
    )
  }

  const healthLabel = findLabel(HEALTH_CONDITION_OPTIONS, pet.healthCondition)
  const hasCondition = Boolean(pet.healthCondition) && pet.healthCondition !== 'healthy'
  const conditionText = healthLabel.toLowerCase()
  const hiddenForAllergy = excluded.filter((e) => e.rule === 'allergen').length
  const activeAllergies = (pet.allergies || []).filter((a) => a && a !== 'none')
  // a condition or an allergy makes a food switch a medical decision, so the
  // note on every card is worded more strongly for those pets
  const vetNote = vetNoteFor(hasCondition || activeAllergies.length > 0)
  const speciesText = findLabel(SPECIES_OPTIONS, pet.species) || 'pet'
  // a stage saved under a different species (dog "puppy" after switching to cat)
  // is left out rather than printed as nonsense
  const stageValue = getLifeStageOptions(pet.species).some((opt) => opt.value === pet.lifeStage)
    ? pet.lifeStage
    : null

  const noticeList = notices.map((notice) => (
    <div key={notice.code} className={`border rounded-lg p-4 text-xs ${noticeClass(notice.code)}`}>
      {notice.message}
    </div>
  ))

  const allergyNote = hiddenForAllergy > 0 && (
    <p className="text-xs text-gray-600 dark:text-gray-400">
      {hiddenForAllergy} product{hiddenForAllergy === 1 ? ' was' : 's were'} hidden because{' '}
      {hiddenForAllergy === 1 ? 'it may' : 'they may'} contain an allergen on {pet.name}&apos;s list.
    </p>
  )

  if (recommendations.length === 0) {
    return (
      <div className="space-y-4">
        {noticeList}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 dark:bg-amber-900/20 dark:border-amber-800">
          <h3 className="font-semibold text-amber-900 mb-1 dark:text-amber-200">No matching products right now</h3>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            We could not find an in-stock, priced product in our current catalog that suits {pet.name}&apos;s
            species, life stage, health, and allergies. We recommend consulting your veterinarian directly.
          </p>
          {allergyNote && <div className="mt-2">{allergyNote}</div>}
        </div>
      </div>
    )
  }

  const firstShown = pageStart + 1
  const lastShown = pageStart + pageItems.length

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-[#0b2e59] to-[#134680] p-4 text-white sm:p-5">
        <h2 className="text-lg font-semibold sm:text-xl">
          Recommended for {pet.name}
        </h2>
        <p className="mt-1 text-sm text-white/80">
          {recommendations.length} product{recommendations.length === 1 ? '' : 's'} for a{' '}
          {speciesText.toLowerCase()}
          {stageValue && (
            <>
              {' '}in the <span className="font-medium">{stageValue}</span> stage
            </>
          )}
          {hasCondition && (
            <>
              {' '}with <span className="font-medium">{conditionText}</span>
            </>
          )}
        </p>
      </div>

      {noticeList}

      <div className="bg-yellow-50 border border-yellow-400 rounded-lg p-4 text-xs text-blue-900 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-100">
        <strong>Note:</strong> These suggestions come from a simple rule-based check of species, life stage,
        health, and allergies. They are not a diagnosis and not a substitute for professional veterinary
        advice. Check the label before you buy.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {firstShown}&ndash;{lastShown} of {recommendations.length}
        </p>
        <select
          value={pageSize}
          onChange={(e) => changePageSize(Number(e.target.value))}
          aria-label="Products per page"
          className="h-8 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-xs text-gray-700 dark:text-gray-200"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s} per page</option>
          ))}
        </select>
      </div>

      {runs.map((run) => (
        run.section === 'best' ? (
          <section key="best" aria-labelledby="best-matches-heading" className="space-y-3">
            <h3 id="best-matches-heading" className="text-base font-semibold text-gray-900 dark:text-white">
              {hasCondition ? `Best matches for ${conditionText}` : 'Recommended foods'}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {run.entries.map(({ item, index }) => (
                <ProductCard
                  key={item.prod_id}
                  product={item}
                  topMatch={index === 0}
                  lowStockThreshold={lowStockThreshold}
                  vetNote={vetNote}
                  onOpen={setQuickItem}
                  onAddToCart={addItem}
                />
              ))}
            </div>
          </section>
        ) : (
          <section key="other" aria-labelledby="other-options-heading" className="space-y-3">
            <h3 id="other-options-heading" className="text-base font-semibold text-gray-900 dark:text-white">
              Other options
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {hasCondition
                ? `These are general foods. No food made for ${conditionText} is available right now.`
                : 'These are general foods rather than a match for your pet\'s profile.'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {run.entries.map(({ item }) => (
                <ProductCard
                  key={item.prod_id}
                  product={item}
                  // a general food is never the top match: no formula here is
                  // built for this pet's condition
                  topMatch={false}
                  lowStockThreshold={lowStockThreshold}
                  vetNote={vetNote}
                  onOpen={setQuickItem}
                  onAddToCart={addItem}
                />
              ))}
            </div>
          </section>
        )
      ))}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1 border-t border-gray-100 pt-4 dark:border-gray-800">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => goToPage(Math.max(1, safePage - 1))}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Prev
          </button>
          {pageNumbersFor(safePage, totalPages).map((p, i) =>
            p === '...' ? (
              <span key={`dots-${i}`} className="px-1.5 text-xs text-gray-300 dark:text-gray-600">...</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => goToPage(p)}
                aria-current={p === safePage ? 'page' : undefined}
                className={`h-9 min-w-[36px] rounded-lg px-2 text-xs font-semibold transition ${
                  p === safePage
                    ? 'bg-[#0b2e59] text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      )}

      {allergyNote}

      <ProductQuickViewDialog
        product={quickProduct}
        sizeVariants={[]}
        isOpen={Boolean(quickItem)}
        onClose={() => setQuickItem(null)}
        onAddToCart={addItem}
        onBuyNow={buyNow}
      />
    </div>
  )
}

export default RecommendationResults
