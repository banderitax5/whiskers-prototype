import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import ProductQuickViewDialog from '../components/ProductQuickViewDialog.jsx'
import { apiGet } from '../lib/api.js'
import { attachSizeVariants } from '../lib/productUtils.js'
import { formatPesos } from '../lib/cartLogic'
import { fetchSiteContent, applyCategoryOverrides } from '../lib/siteContent'
import { trackSearch } from '../lib/appEvents'
import { looksLikeSentence, parseSearch, smartSearchProducts } from '../lib/smartSearch'
import { priceCeilingFor, sliderValueFor, maxPriceFromSlider, matchesMaxPrice, PRICE_STEP } from '../lib/priceFilter'

const PAGE_SIZES = [8, 16, 24, 36]
const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

function toggleArrayItem(arr, item) {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item]
}

// comma-separated URL param -> array (e.g. "?category=Food,Toys" -> ["Food","Toys"])
function parseList(v) {
  return v ? v.split(',').filter(Boolean) : []
}

function Menu() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { addToCart } = useShop()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  // owner's category overrides (label/order/visibility) from site-content
  const [siteContent, setSiteContent] = useState(null)

  // category, brand, and search filters can arrive via URL (nav links, brand tiles)
  // lists are comma-separated in the URL so multi-select survives refresh and Back
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    categories: parseList(searchParams.get('category')),
    brands: parseList(searchParams.get('brand')),
    maxPrice: searchParams.get('maxPrice') || 'all',
  })
  const [sortBy, setSortBy] = useState('name-asc')
  const [viewMode, setViewMode] = useState('grid')
  const [activeProduct, setActiveProduct] = useState(null)
  const [activeSizeVariants, setActiveSizeVariants] = useState([])
  const [pageSize, setPageSize] = useState(8)
  const [currentPage, setCurrentPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  // true while the toolbar is pinned under the navbar (phones); adds its backdrop
  const [toolbarStuck, setToolbarStuck] = useState(false)
  const toolbarObserverRef = useRef(null)
  // callback ref: the toolbar only exists after the product list loads, so the
  // observer must attach whenever the element mounts, not just on first render
  const setToolbarMarker = useCallback((el) => {
    toolbarObserverRef.current?.disconnect()
    toolbarObserverRef.current = null
    if (!el || typeof IntersectionObserver === 'undefined') return
    // The marker sits just above the toolbar. Once it has scrolled behind the
    // navbar the toolbar is pinned, so the trigger line is the navbar's own
    // height - measured instead of hardcoded, because the header is 60px on
    // phones and 72px from sm up (taller logo + padding).
    const navbar = document.querySelector('header')
    const navHeight = navbar ? Math.round(navbar.getBoundingClientRect().height) : 60
    const observer = new IntersectionObserver(
      ([entry]) => setToolbarStuck(!entry.isIntersecting),
      { rootMargin: `-${navHeight + 1}px 0px 0px 0px`, threshold: 0 }
    )
    observer.observe(el)
    toolbarObserverRef.current = observer
  }, [])
  useEffect(() => () => toolbarObserverRef.current?.disconnect(), [])

  // ── mobile filter sheet ──────────────────────────────────────────────────
  // Three ways out: tap the backdrop, press Escape, or drag the grabber down.
  // While it is open the page behind must not scroll, and keyboard focus moves
  // into the sheet (and back to the Filters button when it closes).
  const [sheetOffset, setSheetOffset] = useState(0)
  const sheetRef = useRef(null)
  const sheetDragRef = useRef({ active: false, startY: 0, dy: 0 })
  const filtersButtonRef = useRef(null)

  useEffect(() => {
    if (!showFilters) return undefined
    const previousOverflow = document.body.style.overflow
    const filtersButton = filtersButtonRef.current
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { setShowFilters(false); return }
      if (e.key !== 'Tab') return
      // aria-modal is only honest if Tab cannot wander into the page behind
      const panel = sheetRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (!e.shiftKey && (active === last || active === panel)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const focusTimer = setTimeout(() => sheetRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      clearTimeout(focusTimer)
      setSheetOffset(0)
      filtersButton?.focus?.()
    }
  }, [showFilters])

  function handleSheetPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    sheetDragRef.current = { active: true, startY: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleSheetPointerMove(e) {
    if (!sheetDragRef.current.active) return
    const dy = e.clientY - sheetDragRef.current.startY
    sheetDragRef.current.dy = dy
    setSheetOffset(dy > 0 ? dy : 0)
  }

  function handleSheetPointerEnd(e) {
    if (!sheetDragRef.current.active) return
    const { dy } = sheetDragRef.current
    sheetDragRef.current.active = false
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    // 90px is roughly a third of a thumb swipe; shorter drags snap back
    if (dy > 90) setShowFilters(false)
    else setSheetOffset(0)
  }
  // opt-in sentence search from the empty state
  const [sentenceBusy, setSentenceBusy] = useState(false)
  const [sentenceNoMatchFor, setSentenceNoMatchFor] = useState(null)

  // URL -> filter state (authoritative). Runs on mount, deep links, and
  // browser back/forward, so the exact filter set is always restored.
  useEffect(() => {
    const nextSearch = searchParams.get('search') || ''
    const nextCategories = parseList(searchParams.get('category'))
    const nextBrands = parseList(searchParams.get('brand'))
    const nextMaxPrice = searchParams.get('maxPrice') || 'all'
    setFilters((prev) => {
      const same =
        prev.search === nextSearch &&
        prev.categories.join(',') === nextCategories.join(',') &&
        prev.brands.join(',') === nextBrands.join(',') &&
        prev.maxPrice === nextMaxPrice
      if (same) return prev
      return { ...prev, search: nextSearch, categories: nextCategories, brands: nextBrands, maxPrice: nextMaxPrice }
    })
  }, [searchParams])

  // Record searches after a short pause so the analytics page can show what
  // shoppers actually looked for without logging every keystroke.
  useEffect(() => {
    const query = filters.search.trim()
    if (query.length < 2) return undefined
    const timer = setTimeout(() => trackSearch(query), 900)
    return () => clearTimeout(timer)
  }, [filters.search])

  // filter state -> URL. Discrete filter changes (category/brand/price) push a
  // history entry so Back/forward restores them; search text replaces so typing
  // does not flood the history. no-ops when the URL already matches.
  useEffect(() => {
    const next = {}
    if (filters.search) next.search = filters.search
    if (filters.categories.length) next.category = filters.categories.join(',')
    if (filters.brands.length) next.brand = filters.brands.join(',')
    if (filters.maxPrice !== 'all') next.maxPrice = filters.maxPrice
    const cur = {
      search: searchParams.get('search') || '',
      category: searchParams.get('category') || '',
      brand: searchParams.get('brand') || '',
      maxPrice: searchParams.get('maxPrice') || 'all',
    }
    const nextNorm = {
      search: next.search || '',
      category: next.category || '',
      brand: next.brand || '',
      maxPrice: next.maxPrice || 'all',
    }
    if (cur.search === nextNorm.search && cur.category === nextNorm.category &&
        cur.brand === nextNorm.brand && cur.maxPrice === nextNorm.maxPrice) return
    // maxPrice is deliberately excluded: it is a slider, so pushing a history
    // entry per drag tick would bury the Back button. Category/brand still push.
    const discreteChanged = cur.category !== nextNorm.category ||
      cur.brand !== nextNorm.brand
    setSearchParams(next, { replace: !discreteChanged })
  }, [filters.search, filters.categories, filters.brands, filters.maxPrice]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadFailed(false)
      try {
        const [prodRes, catRes, brandRes, contentRes] = await Promise.all([
          apiGet('/products?pageSize=500'),
          apiGet('/products/categories'),
          apiGet('/products/brands'),
          // force=true: an admin edit to category labels/order shows on the
          // next visit; fetchSiteContent never rejects, so this cannot fail load
          fetchSiteContent(true),
        ])
        setProducts(prodRes.items || [])
        setCategories(catRes.items || [])
        setBrands(brandRes.items || [])
        setSiteContent(contentRes)
      } catch (err) {
        console.error('Failed to load products:', err)
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [attempt])

  // enrich products with size variant info
  const enrichedProducts = useMemo(() => attachSizeVariants(products), [products])

  // category filter list with the owner's label/order/visibility applied;
  // filter values stay the raw category name so URLs and matching are unchanged
  const categoryOptions = useMemo(
    () => applyCategoryOverrides(categories, siteContent?.categories),
    [categories, siteContent],
  )
  const categoryLabel = useCallback(
    (name) => categoryOptions.find((c) => c.name === name)?.label || name,
    [categoryOptions],
  )

  // Top of the price slider, derived from the whole catalog (not the filtered
  // set) so the track does not shrink while the shopper drags.
  const priceCeiling = useMemo(() => priceCeilingFor(products), [products])
  const priceValue = sliderValueFor(filters.maxPrice, priceCeiling)

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  const toggleCategory = useCallback((cat) => {
    setFilters((prev) => ({ ...prev, categories: toggleArrayItem(prev.categories, cat) }))
    setCurrentPage(1)
  }, [])

  const toggleBrand = useCallback((brand) => {
    setFilters((prev) => ({ ...prev, brands: toggleArrayItem(prev.brands, brand) }))
    setCurrentPage(1)
  }, [])

  function resetFilters() {
    setFilters({ search: '', categories: [], brands: [], maxPrice: 'all' })
    setSearchParams({})
    setCurrentPage(1)
  }

  // Runs once per click: the AI only translates the sentence, the existing
  // engine picks the products, and the result is handed over as ?ids=...
  async function runSentenceSearch() {
    const query = filters.search.trim()
    if (!looksLikeSentence(query)) return
    setSentenceBusy(true)
    setSentenceNoMatchFor(null)
    const criteria = await parseSearch(query)
    const matched = criteria ? smartSearchProducts(criteria, enrichedProducts) : null
    setSentenceBusy(false)
    if (!matched || matched.length === 0) {
      setSentenceNoMatchFor(query)
      return
    }
    // keep the other filters (category, brand, price) in the URL as they are
    const next = new URLSearchParams(searchParams)
    next.set('ids', matched.map((p) => p.prod_id).join(','))
    next.set('search', query)
    setSearchParams(next)
    setCurrentPage(1)
  }

  // count how many filters are active
  const activeFilterCount = filters.categories.length + filters.brands.length + (filters.maxPrice !== 'all' ? 1 : 0) + (filters.search ? 1 : 0)

  // product ids handed over from the navbar's sentence search (?ids=1,2,3)
  const smartIds = useMemo(() => {
    const raw = searchParams.get('ids')
    return raw ? new Set(parseList(raw)) : null
  }, [searchParams])

  const filteredProducts = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    let result = enrichedProducts.filter((product) => {
      if (smartIds && !smartIds.has(String(product.prod_id))) return false
      const matchSearch = smartIds || !search || product.prod_name.toLowerCase().includes(search) || (product.brand || '').toLowerCase().includes(search)
      const matchCategory = filters.categories.length === 0 || filters.categories.some((cat) => product.category?.toLowerCase().includes(cat.toLowerCase()))
      const matchBrand = filters.brands.length === 0 || filters.brands.some((b) => product.brand?.toLowerCase() === b.toLowerCase())
      const matchPrice = matchesMaxPrice(product.price, filters.maxPrice)
      return matchSearch && matchCategory && matchBrand && matchPrice
    })

    // sort
    const [field, dir] = sortBy.split('-')
    result.sort((a, b) => {
      const valA = field === 'price' ? a.price : (a.prod_name || '').toLowerCase()
      const valB = field === 'price' ? b.price : (b.prod_name || '').toLowerCase()
      if (valA < valB) return dir === 'asc' ? -1 : 1
      if (valA > valB) return dir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [filters, enrichedProducts, sortBy, smartIds])

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredProducts.slice(start, start + pageSize)
  }, [filteredProducts, safeCurrentPage, pageSize])

  function handleAddToCart(product, qty = 1) {
    addToCart({
      id: product.prod_id,
      name: product.prod_name,
      price: product.price,
      image: product.image_url || '',
      collection: product.category,
      brand: product.brand || '',
    }, qty)
  }

  function handleBuyNow(product, qty = 1) {
    handleAddToCart(product, qty)
    navigate('/cart')
  }

  function getPageNumbers() {
    const pages = []
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, safeCurrentPage - 1)
      let end = Math.min(totalPages - 1, safeCurrentPage + 1)
      if (safeCurrentPage <= 2) end = Math.min(4, totalPages - 1)
      if (safeCurrentPage >= totalPages - 1) start = Math.max(totalPages - 3, 2)
      if (start > 2) pages.push('...')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  if (loading) {
    return (
      <div className="w-full lg:mx-auto lg:max-w-7xl py-6 sm:py-8">
        <div className="mb-6">
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-2" />
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex gap-2">
              <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-9 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-3">
                  <div className="h-40 w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="flex gap-2">
                      <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                      <div className="h-9 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-full lg:w-64 space-y-4">
            <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-9 w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div className="w-full lg:mx-auto lg:max-w-7xl py-6 sm:py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center dark:bg-red-900/30 dark:border-red-800">
          <h2 className="font-semibold text-red-900 dark:text-red-200 mb-1">Could not load products</h2>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full lg:mx-auto lg:max-w-7xl py-6 sm:py-8">
      {/* header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Menu</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Browse our pet products</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* main content */}
        <div className="flex-1 min-w-0">
          {/* marker for the toolbar's stuck state (zero height, takes no space) */}
          <div ref={setToolbarMarker} aria-hidden="true" />
          {/* toolbar - fully transparent until it pins under the navbar */}
          <div className="sticky top-[3.75rem] sm:top-[4.5rem] z-30 px-1 py-2 flex flex-nowrap items-center gap-2 mb-4 lg:flex-wrap lg:static lg:mx-0 lg:px-0 lg:py-0">
            {/* Soft backdrop, shown only while the toolbar is pinned: the page
                background at 80% with a blur behind it, so product cards slide
                under it instead of being sliced by a solid slab. The second
                layer fades that tint out over the gap below the controls, which
                removes the hard bottom edge. Desktop is static -> never shown. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-x-3 sm:-inset-x-4 -top-1 bottom-0 -z-10 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md transition-opacity duration-200 lg:hidden ${toolbarStuck ? 'opacity-100' : 'opacity-0'}`}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-x-3 sm:-inset-x-4 top-full h-4 -z-10 bg-gradient-to-b from-gray-50/80 to-transparent dark:from-gray-900/80 transition-opacity duration-200 lg:hidden ${toolbarStuck ? 'opacity-100' : 'opacity-0'}`}
            />
            <p className="hidden lg:block text-sm text-gray-500 dark:text-gray-400 mr-auto">
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
            </p>

            {/* sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort products"
              className="h-9 min-w-0 flex-1 lg:flex-none whitespace-nowrap rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/30"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* per page - phones get this inside the Filters sheet instead:
                three text controls plus two buttons do not fit across 360px,
                and squeezing them clipped the sort dropdown to its arrow */}
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
              aria-label="Products per page"
              className="hidden lg:block h-9 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/30"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s} per page</option>
              ))}
            </select>

            {/* view toggle */}
            <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`h-8 w-8 flex items-center justify-center rounded-md transition ${viewMode === 'grid' ? 'bg-[#0b2e59] text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                aria-label="Grid view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`h-8 w-8 flex items-center justify-center rounded-md transition ${viewMode === 'list' ? 'bg-[#0b2e59] text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                aria-label="List view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            </div>

            {/* filter toggle (mobile) */}
            <button
              type="button"
              ref={filtersButtonRef}
              aria-expanded={showFilters}
              aria-controls="filters-panel"
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="h-5 min-w-[20px] flex items-center justify-center rounded-full bg-[#0b2e59] text-white text-[10px] font-bold px-1">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {/* active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {filters.search && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  "{filters.search}"
                  <button type="button" onClick={() => updateFilter('search', '')} className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                </span>
              )}
              {filters.categories.map((cat) => (
                <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  {categoryLabel(cat)}
                  <button type="button" onClick={() => toggleCategory(cat)} className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                </span>
              ))}
              {filters.brands.map((b) => (
                <span key={b} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  {b}
                  <button type="button" onClick={() => toggleBrand(b)} className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                </span>
              ))}
              {filters.maxPrice !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  Up to PHP {formatPesos(Number(filters.maxPrice))}
                  <button type="button" onClick={() => updateFilter('maxPrice', 'all')} aria-label="Remove price filter" className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                </span>
              )}
              <button type="button" onClick={resetFilters} className="text-xs font-medium text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 px-1">Clear all</button>
            </div>
          )}

          {/* product grid/list */}
          {paginatedProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No products match your filters</p>
              <button type="button" onClick={resetFilters} className="mt-3 text-sm font-semibold text-[#0b2e59] dark:text-blue-400 hover:underline">Reset filters</button>
              {!smartIds && looksLikeSentence(filters.search) && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={runSentenceSearch}
                    disabled={sentenceBusy}
                    className="h-9 px-4 rounded-lg border border-[#0b2e59] text-sm font-semibold text-[#0b2e59] dark:text-blue-400 dark:border-blue-400 hover:bg-[#0b2e59]/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sentenceBusy ? 'Searching by sentence...' : 'Try a sentence search'}
                  </button>
                  {sentenceNoMatchFor === filters.search.trim() && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No sentence match found. Try different words.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3'
              : 'space-y-3'
            }>
              {paginatedProducts.map((product) => (
                <article
                  key={product.prod_id}
                  onClick={() => {
                    setActiveProduct(product)
                    setActiveSizeVariants(product.sizeVariants || [])
                  }}
                  className={`group rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition cursor-pointer ${
                    viewMode === 'list' ? 'flex items-center gap-4 p-3' : 'overflow-hidden'
                  }`}
                >
                  {/* image — links to the product detail page */}
                  <Link
                    to={`/products/${product.prod_id}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`View details for ${product.prod_name}`}
                    tabIndex={-1}
                    className={`flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 ${
                      viewMode === 'grid' ? 'h-24 sm:h-36' : 'h-16 w-16 flex-shrink-0 rounded-lg'
                    }`}
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.prod_name} loading="lazy" className="max-h-full max-w-full object-contain p-1.5 sm:p-2 group-hover:scale-105 transition" />
                    ) : (
                      <svg className="h-8 w-8 sm:h-10 sm:w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    )}
                  </Link>

                  {/* info */}
                  <div className={`${viewMode === 'grid' ? 'p-2 sm:p-4' : 'flex-1 min-w-0'}`}>
                    {product.brand && (
                      <span className="inline-block text-[9px] sm:text-[10px] font-semibold text-[#0b2e59] dark:text-blue-400 uppercase tracking-wider mb-0.5 sm:mb-1">{product.brand}</span>
                    )}
                    <h3 className={`font-semibold text-gray-800 dark:text-gray-100 leading-tight ${viewMode === 'grid' ? 'text-xs sm:text-sm line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem]' : 'text-sm truncate'}`}>
                      <Link
                        to={`/products/${product.prod_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-[#0b2e59] dark:hover:text-blue-400 hover:underline"
                      >
                        {product.prod_name}
                      </Link>
                    </h3>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 truncate">{product.category}</p>
                    {product.price > 0 ? (
                      <p className="mt-1 sm:mt-2 text-sm sm:text-base font-bold text-gray-900 dark:text-white">PHP {formatPesos(Number(product.price))}</p>
                    ) : (
                      <p className="mt-1 sm:mt-2 text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">Price not yet set</p>
                    )}

                    {/* stock indicator */}
                    {(() => {
                      const stock = Number(product.stock_quantity)
                      if (!Number.isFinite(stock) || stock <= 0) {
                        return <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Out of stock</span>
                      }
                      if (stock <= 5) {
                        return <span className="mt-1 inline-block text-[10px] font-semibold text-amber-600 dark:text-amber-400">Only {stock} left</span>
                      }
                      return null
                    })()}

                    <div className={`mt-2 sm:mt-3 flex gap-1.5 sm:gap-2 ${viewMode === 'list' ? 'flex-shrink-0' : ''}`}>
                      <button
                        type="button"
                        disabled={!(product.price > 0) || Number(product.stock_quantity) <= 0}
                        onClick={(e) => { e.stopPropagation(); handleAddToCart(product) }}
                        className="flex-1 h-8 sm:h-9 rounded-lg bg-yellow-400 px-1.5 sm:px-2 text-[10px] sm:text-xs font-semibold text-gray-900 hover:bg-yellow-500 active:bg-yellow-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {product.price > 0 ? 'Add to Cart' : 'Unavailable'}
                      </button>
                      <button
                        type="button"
                        disabled={!(product.price > 0) || Number(product.stock_quantity) <= 0}
                        onClick={(e) => { e.stopPropagation(); handleBuyNow(product) }}
                        className="flex-1 h-8 sm:h-9 rounded-lg bg-[#0b2e59] px-1.5 sm:px-2 text-[10px] sm:text-xs font-semibold text-white hover:bg-[#15407a] active:bg-[#0a2347] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Buy Now
                      </button>
                    </div>

                    {/* keyboard-accessible path to the quick view modal (the
                        whole card is also clickable for pointer users) */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveProduct(product); setActiveSizeVariants(product.sizeVariants || []) }}
                      className="mt-1.5 sm:mt-2 w-full h-7 sm:h-8 rounded-lg border border-gray-200 dark:border-gray-600 text-[10px] sm:text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      Quick view
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-9 px-3 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Prev
              </button>
              {getPageNumbers().map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-1.5 text-gray-300 dark:text-gray-600 text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`h-9 min-w-[36px] px-2 rounded-lg text-xs font-semibold transition ${
                      p === safeCurrentPage
                        ? 'bg-[#0b2e59] text-white shadow-sm'
                        : 'border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-9 px-3 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* filter sidebar - sticky on large screens, bottom sheet on phones */}
        <aside className={`w-full lg:w-72 flex-shrink-0 ${showFilters ? 'fixed inset-0 z-[10010] flex items-end bg-black/40 lg:static lg:z-auto lg:block lg:bg-transparent' : 'hidden lg:block'}`} onClick={(e) => { if (e.target === e.currentTarget) setShowFilters(false) }}>
          <div
            ref={sheetRef}
            id="filters-panel"
            tabIndex={-1}
            role={showFilters ? 'dialog' : undefined}
            aria-modal={showFilters ? 'true' : undefined}
            aria-label={showFilters ? 'Filters' : undefined}
            style={sheetOffset ? { transform: `translateY(${sheetOffset}px)`, transition: 'none' } : { transition: 'transform 200ms ease-out' }}
            className={`lg:sticky lg:top-24 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden overscroll-contain focus:outline-none ${showFilters ? 'w-full max-h-[85vh] overflow-y-auto rounded-b-none rounded-t-2xl lg:max-h-none lg:overflow-hidden lg:rounded-xl' : ''}`}
          >
            {/* grabber - drag down to dismiss. touch-none is deliberate here and
                only here: the handle must claim the vertical gesture, otherwise
                the sheet scrolls instead of following the finger. */}
            <div
              data-sheet-handle="true" className="lg:hidden flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerEnd}
              onPointerCancel={handleSheetPointerEnd}
            >
              <span className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
            </div>

            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Filters</h2>
              </div>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button type="button" onClick={resetFilters} className="text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400">
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  aria-label="Close filters"
                  className="lg:hidden h-8 w-8 -mr-1 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* search */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Search</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    type="search"
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                    placeholder="Search products..."
                    aria-label="Search products"
                    className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 pl-9 pr-3 text-sm dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/20 focus:border-[#0b2e59]/40 transition"
                  />
                </div>
              </div>

              {/* category checkboxes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Category</label>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-2">
                  <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                    <input
                      type="checkbox"
                      checked={filters.categories.length === 0}
                      onChange={() => updateFilter('categories', [])}
                      className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">All</span>
                  </label>
                  {categoryOptions.map((cat) => (
                    <label key={cat.name} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                      <input
                        type="checkbox"
                        checked={filters.categories.includes(cat.name)}
                        onChange={() => toggleCategory(cat.name)}
                        className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* brand checkboxes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Brand</label>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-2">
                  <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                    <input
                      type="checkbox"
                      checked={filters.brands.length === 0}
                      onChange={() => updateFilter('brands', [])}
                      className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">All</span>
                  </label>
                  {brands.map((b) => (
                    <label key={b} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                      <input
                        type="checkbox"
                        checked={filters.brands.includes(b)}
                        onChange={() => toggleBrand(b)}
                        className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{b}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* price - a max-only slider on purpose: prices run 1-6,000 with a
                  median of 200, so a floor thumb would sit at the far left for
                  almost every search, and "show me the expensive end" is already
                  served by sorting Price: High to Low. */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label htmlFor="filter-max-price" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Max price</label>
                  <span className="text-xs font-semibold text-[#0b2e59] dark:text-blue-300">
                    {filters.maxPrice === 'all' ? 'Any price' : `Up to PHP ${formatPesos(Number(filters.maxPrice))}`}
                  </span>
                </div>
                <input
                  id="filter-max-price"
                  type="range"
                  min={0}
                  max={priceCeiling}
                  step={PRICE_STEP}
                  value={priceValue}
                  onChange={(e) => updateFilter('maxPrice', maxPriceFromSlider(e.target.value, priceCeiling))}
                  aria-valuetext={filters.maxPrice === 'all' ? 'Any price' : `Up to ${formatPesos(Number(filters.maxPrice))} pesos`}
                  className="h-6 w-full cursor-pointer accent-[#0b2e59] dark:accent-yellow-400"
                />
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                  <span>PHP 0</span>
                  <span>PHP {formatPesos(priceCeiling)}</span>
                </div>
              </div>

              {/* products per page - phones only; the toolbar shows it from lg up
                  so the sort dropdown keeps its full label at 360px */}
              <div className="lg:hidden">
                <label htmlFor="filter-page-size" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Products per page</label>
                <select
                  id="filter-page-size"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/20 focus:border-[#0b2e59]/40 transition"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>{s} per page</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <ProductQuickViewDialog
        product={activeProduct}
        sizeVariants={activeSizeVariants}
        isOpen={Boolean(activeProduct)}
        onClose={() => { setActiveProduct(null); setActiveSizeVariants([]) }}
        onAddToCart={(product, qty) => handleAddToCart(product, qty)}
        onBuyNow={(product, qty) => handleBuyNow(product, qty)}
      />
    </div>
  )
}

export default Menu
