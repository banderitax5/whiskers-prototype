import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
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

function Home() {
  const navigate = useNavigate()
  const { addToCart } = useShop()
  const [activeProduct, setActiveProduct] = useState(null)
  const [activeSizeVariants, setActiveSizeVariants] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentSlide, setCurrentSlide] = useState(0)

  // auto-rotate carousel
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

  // enrich products with size variant info
  const enrichedProducts = useMemo(() => attachSizeVariants(products), [products])

  // group products by category for display
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

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <section className="mx-auto max-w-7xl px-4 pt-2">
          <div className="h-[250px] sm:h-[325px] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        </section>
        {[1,2].map(i => (
          <div key={i} className="mx-auto max-w-7xl px-4">
            <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-3 animate-pulse" />
            <div className="flex gap-3 sm:gap-4 overflow-hidden">
              {[1,2,3,4].map(j => (
                <div key={j} className="flex-shrink-0 w-44 sm:w-52 h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* hero carousel */}
      <section className="mx-auto max-w-7xl px-4 pt-2">
        <div className="relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 h-[250px] sm:h-[325px]">
          {CAROUSEL_SLIDES.map((slide, idx) => (
            <div
              key={idx}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${idx === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <img src={slide.image} alt={slide.alt} className="h-full w-full object-cover" />
            </div>
          ))}
          {/* prev/next arrows */}
          <button type="button" onClick={prevSlide} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={nextSlide} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          {/* dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {CAROUSEL_SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === currentSlide ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {Object.entries(groupedByCategory).slice(0, 6).map(([category, catProducts]) => (
        <div key={category} className="mx-auto mt-6 max-w-7xl px-4 sm:mt-8 md:mt-10">
          <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-wide">{category.toUpperCase()}</h2>
            <a href="/menu" className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm font-semibold uppercase whitespace-nowrap">VIEW ALL</a>
          </div>
          <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 sm:pb-4 scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth">
            {catProducts.slice(0, 7).map((product) => (
              <div
                key={product.prod_id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveProduct(product)
                  setActiveSizeVariants(product.sizeVariants || [])
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setActiveProduct(product)
                    setActiveSizeVariants(product.sizeVariants || [])
                  }
                }}
                className="snap-start flex-shrink-0 w-44 sm:w-52 md:w-56 lg:w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden cursor-pointer"
              >
                <div className="p-3 bg-gray-50 dark:bg-gray-700 flex items-center justify-center h-32 sm:h-36 md:h-40">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.prod_name} loading="lazy" className="max-h-full max-w-full object-contain"/>
                  ) : (
                    <svg className="h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                  <span className="inline-block bg-red-800 text-white text-[10px] sm:text-xs font-semibold px-1 py-1 rounded-lg leading-tight">
                    {category}
                  </span>
                  <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight min-h-[2.5rem]">{product.prod_name}</p>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">PHP {product.price.toFixed(2)}</p>
                </div>
                <div className="p-3 sm:p-4 pt-0 space-y-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddToCart(product)
                    }}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900 font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors touch-manipulation min-h-[40px]"
                  >
                    <svg className="w-4 h-4 sm:w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="whitespace-nowrap">ADD TO CART</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBuyNow(product)
                    }}
                    className="w-full bg-[#0b2e59] hover:bg-[#15407a] text-white font-semibold py-2.5 rounded-md text-xs sm:text-sm transition-colors min-h-[40px]"
                  >
                    BUY NOW
                  </button>
                </div>
              </div>
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
