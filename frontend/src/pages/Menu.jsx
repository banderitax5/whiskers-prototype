import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import ProductQuickViewDialog from '../components/ProductQuickViewDialog.jsx'
import { apiGet } from '../lib/api.js'

const PAGE_SIZES = [8, 16, 24, 36]
const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

function Menu() {
  const navigate = useNavigate()
  const { addToCart } = useShop()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])

  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    brand: 'all',
    maxPrice: 'all',
  })
  const [sortBy, setSortBy] = useState('name-asc')
  const [viewMode, setViewMode] = useState('grid')
  const [activeProduct, setActiveProduct] = useState(null)
  const [pageSize, setPageSize] = useState(8)
  const [currentPage, setCurrentPage] = useState(1)
  const [showFilters, setShowFilters] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, catRes, brandRes] = await Promise.all([
          apiGet('/products?pageSize=500'),
          apiGet('/products/categories'),
          apiGet('/products/brands'),
        ])
        setProducts(prodRes.items || [])
        setCategories(catRes.items || [])
        setBrands(brandRes.items || [])
      } catch (err) {
        console.error('Failed to load products:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  function resetFilters() {
    setFilters({ search: '', category: 'all', brand: 'all', maxPrice: 'all' })
    setCurrentPage(1)
  }

  // count how many filters are active
  const activeFilterCount = [filters.category, filters.brand, filters.maxPrice].filter(v => v !== 'all').length + (filters.search ? 1 : 0)

  const filteredProducts = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    let result = products.filter((product) => {
      const matchSearch = !search || product.prod_name.toLowerCase().includes(search)
      const matchCategory = filters.category === 'all' || product.category === filters.category
      const matchBrand = filters.brand === 'all' || product.brand?.toLowerCase() === filters.brand.toLowerCase()
      const matchPrice =
        filters.maxPrice === 'all' ||
        (filters.maxPrice === '300' && product.price <= 300) ||
        (filters.maxPrice === '600' && product.price <= 600) ||
        (filters.maxPrice === '1000' && product.price <= 1000)
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
  }, [filters, products, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredProducts.slice(start, start + pageSize)
  }, [filteredProducts, safeCurrentPage, pageSize])

  const rangeStart = filteredProducts.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(safeCurrentPage * pageSize, filteredProducts.length)

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
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <span className="loading loading-spinner loading-lg text-[#0b2e59]"></span>
        <p className="mt-4 text-sm text-gray-400">Loading products...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Menu</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Browse our pet products</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* main content */}
        <div className="flex-1 min-w-0">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mr-auto">
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
            </p>

            {/* sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/30"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* per page */}
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
              className="h-9 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/30"
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
              {filters.category !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  {filters.category}
                  <button type="button" onClick={() => updateFilter('category', 'all')} className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                </span>
              )}
              {filters.brand !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  {filters.brand}
                  <button type="button" onClick={() => updateFilter('brand', 'all')} className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                </span>
              )}
              {filters.maxPrice !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1">
                  Under PHP {filters.maxPrice}
                  <button type="button" onClick={() => updateFilter('maxPrice', 'all')} className="hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
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
            </div>
          ) : (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3'
              : 'space-y-3'
            }>
              {paginatedProducts.map((product) => (
                <article
                  key={product.prod_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveProduct(product)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveProduct(product) }}
                  className={`group rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition cursor-pointer ${
                    viewMode === 'list' ? 'flex items-center gap-4 p-3' : 'overflow-hidden'
                  }`}
                >
                  {/* image */}
                  <div className={`flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 ${
                    viewMode === 'grid' ? 'h-32 sm:h-36' : 'h-16 w-16 flex-shrink-0 rounded-lg'
                  }`}>
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.prod_name} loading="lazy" className="max-h-full max-w-full object-contain p-2 group-hover:scale-105 transition" />
                    ) : (
                      <svg className="h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    )}
                  </div>

                  {/* info */}
                  <div className={`${viewMode === 'grid' ? 'p-3 sm:p-4' : 'flex-1 min-w-0'}`}>
                    {product.brand && (
                      <span className="inline-block text-[10px] font-semibold text-[#0b2e59] dark:text-blue-400 uppercase tracking-wider mb-1">{product.brand}</span>
                    )}
                    <h3 className={`font-semibold text-gray-800 dark:text-gray-100 leading-tight ${viewMode === 'grid' ? 'text-sm line-clamp-2 min-h-[2.5rem]' : 'text-sm truncate'}`}>
                      {product.prod_name}
                    </h3>
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 truncate">{product.category}</p>
                    <p className="mt-2 text-base font-bold text-gray-900 dark:text-white">PHP {product.price.toFixed(2)}</p>

                    <div className={`mt-3 flex gap-2 ${viewMode === 'list' ? 'flex-shrink-0' : ''}`}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleAddToCart(product) }}
                        className="flex-1 h-9 rounded-lg bg-yellow-400 px-2 text-xs font-semibold text-gray-900 hover:bg-yellow-500 active:bg-yellow-600 transition"
                      >
                        Add to Cart
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleBuyNow(product) }}
                        className="flex-1 h-9 rounded-lg bg-[#0b2e59] px-2 text-xs font-semibold text-white hover:bg-[#15407a] active:bg-[#0a2347] transition"
                      >
                        Buy Now
                      </button>
                    </div>
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

        {/* filter sidebar - sticky on large screens */}
        <aside className={`w-full lg:w-72 flex-shrink-0 ${showFilters ? '' : 'hidden lg:block'}`}>
          <div className="lg:sticky lg:top-24 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Filters</h2>
              </div>
              {activeFilterCount > 0 && (
                <button type="button" onClick={resetFilters} className="text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400">
                  Clear all
                </button>
              )}
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
                    className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 pl-9 pr-3 text-sm dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/20 focus:border-[#0b2e59]/40 transition"
                  />
                </div>
              </div>

              {/* category */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => updateFilter('category', e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/20 focus:border-[#0b2e59]/40 transition"
                >
                  <option value="all">All Categories</option>
                  {categories.map((item) => (<option key={item} value={item}>{item}</option>))}
                </select>
              </div>

              {/* brand */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Brand</label>
                <select
                  value={filters.brand}
                  onChange={(e) => updateFilter('brand', e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/20 focus:border-[#0b2e59]/40 transition"
                >
                  <option value="all">All Brands</option>
                  {brands.map((item) => (<option key={item} value={item}>{item}</option>))}
                </select>
              </div>

              {/* price */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Max Price</label>
                <select
                  value={filters.maxPrice}
                  onChange={(e) => updateFilter('maxPrice', e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/20 focus:border-[#0b2e59]/40 transition"
                >
                  <option value="all">Any Price</option>
                  <option value="300">Up to PHP 300</option>
                  <option value="600">Up to PHP 600</option>
                  <option value="1000">Up to PHP 1,000</option>
                </select>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <ProductQuickViewDialog
        product={activeProduct}
        isOpen={Boolean(activeProduct)}
        onClose={() => setActiveProduct(null)}
        onAddToCart={(product, qty) => handleAddToCart(product, qty)}
        onBuyNow={(product, qty) => handleBuyNow(product, qty)}
      />
    </div>
  )
}

export default Menu
