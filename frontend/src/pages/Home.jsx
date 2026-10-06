import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { BsTrophy } from 'react-icons/bs'
import ProductQuickViewDialog from '../components/ProductQuickViewDialog.jsx'
import { apiGet } from '../lib/api.js'
import { attachSizeVariants } from '../lib/productUtils.js'

const CAROUSEL_SLIDES = [
  { image: '/banner.png', alt: 'Whiskers Pet Shop' },
  { image: '/categoryshop/dog.jpg', alt: 'Dog Food Collection' },
  { image: '/categoryshop/cat.jpg', alt: 'Cat Food Collection' },
  { image: '/categoryshop/fish.png', alt: 'Fish Supplies' },
  { image: '/categoryshop/berd.jpg', alt: 'Bird Supplies' },
]

const SHELL = 'space-y-6 sm:space-y-8 lg:mx-auto lg:max-w-7xl'
const HERO_HEIGHT = 'h-[200px] sm:h-[250px] md:h-[325px]'
const HEADING_ROW = 'mb-3 sm:mb-4 flex items-center justify-between gap-2'
const CARD_ROW = 'flex gap-2 sm:gap-4 pb-3 sm:pb-4'
const CARD_SHELL =
  'flex-shrink-0 w-36 sm:w-52 md:w-56 lg:w-60 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden'
const PULSE = 'bg-gray-200 dark:bg-gray-700 rounded animate-pulse'

// medal styling for the top 3 best sellers: gold, silver, bronze
const MEDALS = {
  1: { card: 'border-yellow-400 ring-2 ring-yellow-400/60', chip: 'bg-yellow-400 text-gray-900 ring-2 ring-white' },
  2: { card: 'border-gray-300 ring-2 ring-gray-300/70 dark:border-gray-400 dark:ring-gray-400/60', chip: 'bg-gray-200 text-gray-800 ring-2 ring-white dark:bg-gray-300 dark:text-gray-900' },
  3: { card: 'border-amber-600 ring-2 ring-amber-600/50 dark:border-amber-500 dark:ring-amber-500/50', chip: 'bg-amber-600 text-white ring-2 ring-white dark:bg-amber-500' },
}

function ProductCard({ product, soldCount, rank, onQuickView, onAddToCart, onBuyNow }) {
  const medal = MEDALS[rank]

  function openQuickView() {
    onQuickView(product)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openQuickView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onQuickView(product)
        }
      }}
      className={`snap-start flex-shrink-0 w-36 sm:w-52 md:w-56 lg:w-60 bg-white dark:bg-gray-800 border rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${medal ? medal.card : 'border-gray-200 dark:border-gray-700'}`}
    >
      <div className="relative p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 flex items-center justify-center h-24 sm:h-36 md:h-40">
        {product.image_url ? (
          <img src={product.image_url} alt={product.prod_name} loading="lazy" className="max-h-full max-w-full object-contain transition-transform duration-200 hover:scale-105"/>
        ) : (
          <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
        {soldCount != null && (
          <span className="absolute bottom-1.5 left-1.5 bg-yellow-400 text-gray-900 text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm">
            {soldCount} sold
          </span>
        )}
        {rank != null && (
          <span className={`absolute top-1.5 left-1.5 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[10px] sm:text-xs font-black shadow-md ${medal ? medal.chip : 'bg-[#0b2e59] text-white'}`}>
            {rank}
          </span>
        )}
      </div>
      <div className="p-2 sm:p-4 space-y-1 sm:space-y-2">
        <span className="inline-block bg-red-800 text-white text-[9px] sm:text-xs font-semibold px-1 py-0.5 rounded leading-tight">
          {product.category || 'Other'}
        </span>
        <p className="text-xs sm:text-base font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight min-h-[2rem] sm:min-h-[2.5rem]">{product.prod_name}</p>
        <p className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">PHP {Number(product.price || 0).toFixed(2)}</p>
      </div>
      <div className="p-2 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAddToCart(product)
          }}
          className="w-full bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900 font-semibold py-2 sm:py-2.5 rounded-md flex items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm transition-all duration-200 touch-manipulation min-h-[34px] sm:min-h-[40px] hover:shadow-sm active:scale-[0.98]"
        >
          <svg className="w-3.5 h-3.5 sm:w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="whitespace-nowrap">ADD TO CART</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onBuyNow(product)
          }}
          className="w-full bg-[#0b2e59] hover:bg-[#15407a] active:bg-[#1a4f8f] text-white font-semibold py-2 sm:py-2.5 rounded-md text-[10px] sm:text-sm transition-all duration-200 min-h-[34px] sm:min-h-[40px] hover:shadow-sm active:scale-[0.98]"
        >
          BUY NOW
        </button>
      </div>
    </div>
  )
}

function Home() {
  const navigate = useNavigate()
  const { addToCart } = useShop()
  const [activeProduct, setActiveProduct] = useState(null)
  const [activeSizeVariants, setActiveSizeVariants] = useState([])
  const [products, setProducts] = useState([])
  const [bestSellers, setBestSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const goToSlide = useCallback((idx) => setCurrentSlide(idx), [])
  const prevSlide = useCallback(() => setCurrentSlide((p) => (p - 1 + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length), [])
  const nextSlide = useCallback(() => setCurrentSlide((p) => (p + 1) % CAROUSEL_SLIDES.length), [])

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGet('/products?pageSize=200')
        setProducts(res.items || [])
      } catch (err) {
        console.error('Failed to load products:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    let cancelled = false
    apiGet('/products/trending?limit=8')
      .then(({ items }) => { if (!cancelled) setBestSellers(items || []) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  const enrichedProducts = useMemo(() => attachSizeVariants(products), [products])

  // best sellers: same ranking as the search "Trending" list and the admin
  // data analytics "Top Selling Products" card
  const bestSellerProducts = useMemo(() => {
    const byId = new Map(enrichedProducts.map(p => [String(p.prod_id), p]))
    return bestSellers
      .map(t => ({ ...(byId.get(String(t.prod_id)) || t), quantity: t.quantity }))
      .filter(p => p.price != null)
  }, [bestSellers, enrichedProducts])

  const groupedByCategory = enrichedProducts.reduce((acc, product) => {
    const cat = product.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(product)
    return acc
  }, {})

  function handleAddToCart(product, qty = 1) {
    addToCart({
      id: product.prod_id,
      name: product.prod_name,
      price: product.price,
      image: product.image_url || '',
      collection: product.category,
      brand: product.brand || '',
      size: product.sizeLabel || '',
    }, qty)
  }

  function handleBuyNow(product, qty = 1) {
    handleAddToCart(product, qty)
    navigate('/cart')
  }

  function openQuickView(product) {
    setActiveProduct(product)
    setActiveSizeVariants(product.sizeVariants || [])
  }

  const bestSellersRef = useRef(null)
  const [bestSellerScroll, setBestSellerScroll] = useState({ left: false, right: false })

  function updateBestSellerScroll() {
    const el = bestSellersRef.current
    if (!el) return
    setBestSellerScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }

  function scrollBestSellers(dir) {
    const el = bestSellersRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' })
  }

  useEffect(() => {
    updateBestSellerScroll()
  }, [bestSellerProducts.length])

  if (loading) {
    return (
      <>
      <span role="status" className="sr-only">Loading...</span>
      <div className={SHELL} aria-hidden="true">
        <section className="pt-2">
          <div className={`${HERO_HEIGHT} bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse`} />
        </section>
        {[1, 2].map((i) => (
          <div key={i}>
            <div className={HEADING_ROW}>
              <div className={`${PULSE} h-7 sm:h-8 w-48`} />
              <div className={`${PULSE} h-4 sm:h-5 w-16`} />
            </div>
            <div className={`${CARD_ROW} overflow-hidden`}>
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className={CARD_SHELL}>
                  <div className="h-24 sm:h-36 md:h-40 bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <div className="p-2 sm:p-4 space-y-1 sm:space-y-2">
                    <div className={`${PULSE} h-4 sm:h-5 w-16`} />
                    <div className="min-h-[2rem] sm:min-h-[2.5rem] space-y-1 sm:space-y-2">
                      <div className={`${PULSE} h-3 w-full`} />
                      <div className={`${PULSE} h-3 w-3/4`} />
                    </div>
                    <div className={`${PULSE} h-5 sm:h-7 w-20`} />
                  </div>
                  <div className="p-2 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
                    <div className={`${PULSE} h-[34px] sm:h-10 rounded-md`} />
                    <div className={`${PULSE} h-[34px] sm:h-10 rounded-md`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      </>
    )
  }

  return (
    <div className={SHELL}>
      <section className="pt-2">
        <div className={`relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 ${HERO_HEIGHT}`}>
          {CAROUSEL_SLIDES.map((slide, idx) => (
            <div
              key={idx}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${idx === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <img src={slide.image} alt={slide.alt} className="h-full w-full object-cover" />
            </div>
          ))}
          <button type="button" onClick={prevSlide} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-all duration-200 hover:scale-110">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={nextSlide} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-all duration-200 hover:scale-110">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {CAROUSEL_SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {bestSellerProducts.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2e59] via-[#15407a] to-[#0b2e59] px-3 sm:px-5 py-4 sm:py-5 shadow-lg ring-1 ring-white/10">
          <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-yellow-400/15" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-red-500/10" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" />

          <div className="relative mb-3 flex items-center justify-between gap-3 sm:mb-4">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-[#0b2e59] shadow-md">
                <BsTrophy className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl md:text-2xl font-black tracking-wide text-white">BEST SELLERS</h2>
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">Top ranked by sales</p>
              </div>
            </div>
            <a href="/menu" className="shrink-0 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition">View all</a>
          </div>

          <div className="relative">
            <div
              ref={bestSellersRef}
              onScroll={updateBestSellerScroll}
              className="flex gap-2 sm:gap-4 overflow-x-auto pb-1 sm:pb-2 scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth"
            >
              {bestSellerProducts.map((product, idx) => (
                <ProductCard
                  key={product.prod_id}
                  product={product}
                  soldCount={product.quantity}
                  rank={idx + 1}
                  onQuickView={openQuickView}
                  onAddToCart={handleAddToCart}
                  onBuyNow={handleBuyNow}
                />
              ))}
            </div>

            <button
              type="button"
              aria-label="Scroll to previous best sellers"
              onClick={() => scrollBestSellers(-1)}
              className={`absolute left-0 top-1/2 z-10 flex h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#0b2e59] shadow-lg ring-1 ring-black/10 hover:bg-yellow-400 active:scale-95 transition-all duration-200 ${bestSellerScroll.left ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              type="button"
              aria-label="Scroll to more best sellers"
              onClick={() => scrollBestSellers(1)}
              className={`absolute right-0 top-1/2 z-10 flex h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#0b2e59] shadow-lg ring-1 ring-black/10 hover:bg-yellow-400 active:scale-95 transition-all duration-200 ${bestSellerScroll.right ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </section>
      )}

      {Object.entries(groupedByCategory).slice(0, 6).map(([category, catProducts]) => (
        <div key={category} className="mt-6 sm:mt-8 md:mt-10">
          <div className={HEADING_ROW}>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-wide">{category.toUpperCase()}</h2>
            <a href="/menu" className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm font-semibold uppercase whitespace-nowrap transition-colors hover:text-blue-800 dark:hover:text-blue-300">VIEW ALL</a>
          </div>
          <div className={`${CARD_ROW} overflow-x-auto scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth`}>
            {catProducts.slice(0, 7).map((product) => (
              <ProductCard
                key={product.prod_id}
                product={product}
                onQuickView={openQuickView}
                onAddToCart={handleAddToCart}
                onBuyNow={handleBuyNow}
              />
            ))}
          </div>
        </div>
      ))}

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

export default Home
