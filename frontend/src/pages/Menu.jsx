import { useMemo, useState } from 'react'

// static menu seed data used by filter controls
const PRODUCTS = [
    {
       id: 1, 
       name: 'Pet Goats Powder Milk', 
       price: 200, 
       image: '/categoryshop/dog.jpg', 
       collection: 'Food', 
       lifeStage: 'Adult Dog', 
       brand: 'Whiskers' 
    },
    { 
      id: 2, 
      name: 'Ciao Can Treats', 
      price: 150, 
      image: '/categoryshop/cat.jpg', 
      collection: 'Vitamins and Medicine', 
      lifeStage: 'Kitten', 
      brand: 'Ciao' 
    },
    { id: 3, name: 'Premium Dog Food', price: 350, image: '/categoryshop/dog.png', collection: 'Food', lifeStage: 'Adult Dog', brand: 'Royal Canin' },
    { id: 4, name: 'Cat Vitamins', price: 280, image: '/categoryshop/fish.png', collection: 'Vitamins and Medicine', lifeStage: 'Adult Cat', brand: 'Whiskas' },
    { id: 5, name: 'Bird Cage Accessories', price: 450, image: '/categoryshop/berd.jpg', collection: 'Accessories', lifeStage: 'Adult', brand: 'Avian Plus' },
    { id: 6, name: 'Automatic Pet Feeder', price: 1200, image: '/categoryshop/feeder.jpg', collection: 'Pet Equipment', lifeStage: 'All Stage', brand: 'Whiskers' },
    { id: 7, name: 'Aquarium Filter System', price: 550, image: '/categoryshop/fish.webp', collection: 'Accessories', lifeStage: 'Adult', brand: 'Aqua Pro' },
    { id: 8, name: 'Pet Grooming Kit', price: 320, image: '/categoryshop/all.png', collection: 'Grooming Supplies', lifeStage: 'All Stage', brand: 'FurCare' },
]

// user-facing menu page with responsive filter controls
// left side has grouped filter options and right side has dropdown filters
// all controls update the product results list below
function Menu() {

  const collections = ['Food', 'Vitamins and Medicine', 'Accessories', 'Cages', 'Grooming Supplies', 'Pet Equipment']
  const lifeStages = ['Puppy', 'Kitten', 'Adult Dog', 'Adult Cat', 'Senior Dog', 'Senior Cat', 'All Stage']
  const brands = ['Whiskers', 'Royal Canin', 'Whiskas', 'Ciao', 'Aqua Pro', 'Avian Plus', 'FurCare']

  const [filters, setFilters] = useState({
    search: '',
    collection: 'all',
    lifeStage: 'all',
    brand: 'all',
    maxPrice: 'all',
  })
  const [viewMode, setViewMode] = useState('grid')

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function resetFilters() {
    setFilters({
      search: '',
      collection: 'all',
      lifeStage: 'all',
      brand: 'all',
      maxPrice: 'all',
    })
  }

  const filteredProducts = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return PRODUCTS.filter((product) => {
      const matchSearch = !search || product.name.toLowerCase().includes(search)
      const matchCollection = filters.collection === 'all' || product.collection === filters.collection
      const matchLifeStage = filters.lifeStage === 'all' || product.lifeStage === filters.lifeStage
      const matchBrand = filters.brand === 'all' || product.brand === filters.brand
      const matchPrice =
        filters.maxPrice === 'all' ||
        (filters.maxPrice === '300' && product.price <= 300) ||
        (filters.maxPrice === '600' && product.price <= 600) ||
        (filters.maxPrice === '1000' && product.price <= 1000)

      return matchSearch && matchCollection && matchLifeStage && matchBrand && matchPrice
    })
  }, [filters])

  const totalProducts = PRODUCTS.length
  const displayedCount = filteredProducts.length
  const rangeStart = displayedCount > 0 ? 1 : 0
  const rangeEnd = displayedCount

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-xl bg-[#0b2e59] p-4 text-white">
          <h2 className="mb-3 text-sm font-medium text-white/70">Drop Down Collection</h2>
          <details open className="mb-4">
            <summary className="cursor-pointer list-none text-base font-semibold">Collections</summary>
            <ul className="mt-2 space-y-2 rounded-md bg-white p-3 text-gray-900">
              {collections.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => updateFilter('collection', item)}
                    className="w-full text-left text-sm font-semibold hover:text-[#0b2e59]"
                  >
                    - {item}
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <details open className="mb-4">
            <summary className="cursor-pointer list-none text-base font-semibold">Life Stage</summary>
            <ul className="mt-2 space-y-2 rounded-md bg-white p-3 text-gray-900">
              {lifeStages.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => updateFilter('lifeStage', item)}
                    className="w-full text-left text-sm font-semibold hover:text-[#0b2e59]"
                  >
                    - {item}
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <details open>
            <summary className="cursor-pointer list-none text-base font-semibold">Brands</summary>
            <ul className="mt-2 space-y-2 rounded-md bg-white p-3 text-gray-900">
              {brands.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => updateFilter('brand', item)}
                    className="w-full text-left text-sm font-semibold hover:text-[#0b2e59]"
                  >
                    - {item}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </aside>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          {/* products get the primary space */}
          <div className="order-2 space-y-3 xl:order-1">
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                Showing {rangeStart}-{rangeEnd} of {totalProducts} products
              </p>
              <div className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`h-8 px-3 text-xs font-semibold rounded ${viewMode === 'grid' ? 'bg-[#0b2e59] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Large Thumbnails
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`h-8 px-3 text-xs font-semibold rounded ${viewMode === 'list' ? 'bg-[#0b2e59] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  List View
                </button>
              </div>
            </div>

            <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3' : 'space-y-3'}>
              {filteredProducts.map((product) => (
                <article
                  key={product.id}
                  className={viewMode === 'grid'
                    ? 'rounded-lg border border-gray-200 bg-white p-3 shadow-sm'
                    : 'rounded-lg border border-gray-200 bg-white p-3 shadow-sm flex items-center gap-3'}
                >
                  <div
                    className={viewMode === 'grid'
                      ? 'mb-3 flex h-28 items-center justify-center rounded-md bg-gray-50'
                      : 'flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md bg-gray-50'}
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className={viewMode === 'grid' ? 'h-20 w-20 object-contain' : 'h-12 w-12 object-contain'}
                    />
                  </div>

                  <div className={viewMode === 'grid' ? '' : 'min-w-0 flex-1'}>
                    <h3 className={`font-semibold text-gray-800 ${viewMode === 'grid' ? 'text-sm line-clamp-2' : 'text-sm truncate'}`}>
                      {product.name}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">{product.collection} · {product.brand}</p>
                    <p className="mt-2 text-base font-bold text-gray-900">PHP {product.price.toFixed(2)}</p>
                  </div>
                </article>
              ))}
              {filteredProducts.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
                  No menu items match the selected filters.
                </div>
              )}
            </div>
          </div>

          {/* search filter card moves to the right end on wide screens */}
          <div className="order-1 w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-sm sm:max-w-md xl:order-2 xl:justify-self-end xl:sticky xl:top-24">
            <div className="bg-yellow-400 px-4 py-2 text-xl sm:text-2xl font-bold text-black">Search Filters</div>
            <div className="space-y-2.5 p-3 sm:p-4">
              <input
                type="search"
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                placeholder="Search menu items"
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2e59]/30"
              />
              <select
                value={filters.collection}
                onChange={(e) => updateFilter('collection', e.target.value)}
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm font-semibold"
              >
                <option value="all">Collections</option>
                {collections.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={filters.lifeStage}
                  onChange={(e) => updateFilter('lifeStage', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm font-semibold"
                >
                  <option value="all">Life Stage</option>
                  {lifeStages.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={filters.brand}
                  onChange={(e) => updateFilter('brand', e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm font-semibold"
                >
                  <option value="all">Brands</option>
                  {brands.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <select
                value={filters.maxPrice}
                onChange={(e) => updateFilter('maxPrice', e.target.value)}
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm font-semibold"
              >
                <option value="all">Max Price</option>
                <option value="300">Up to PHP 300</option>
                <option value="600">Up to PHP 600</option>
                <option value="1000">Up to PHP 1000</option>
              </select>
              <button
                type="button"
                onClick={resetFilters}
                className="h-10 rounded-md bg-[#0b2e59] px-4 text-sm font-semibold text-white hover:bg-[#15407a]"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Menu

