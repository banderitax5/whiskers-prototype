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

const SHELL = 'space-y-6 sm:space-y-8 lg:mx-auto lg:max-w-7xl'
const HERO_HEIGHT = 'h-[200px] sm:h-[250px] md:h-[325px]'
const HEADING_ROW = 'mb-3 sm:mb-4 flex items-center justify-between gap-2'
const CARD_ROW = 'flex gap-2 sm:gap-4 pb-3 sm:pb-4'
const CARD_SHELL =
  'flex-shrink-0 w-36 sm:w-52 md:w-56 lg:w-60 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden'
const PULSE = 'bg-gray-200 dark:bg-gray-700 rounded animate-pulse'

function Home() {
  const navigate = useNavigate()
  const { addToCart } = useShop()
  const [activeProduct, setActiveProduct] = useState(null)
  const [activeSizeVariants, setActiveSizeVariants] = useState([])
  const [products, setProducts] = useState([])
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

  const enrichedProducts = useMemo(() => attachSizeVariants(products), [products])

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

      {Object.entries(groupedByCategory).slice(0, 6).map(([category, catProducts]) => (
        <div key={category} className="mt-6 sm:mt-8 md:mt-10">
          <div className={HEADING_ROW}>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-wide">{category.toUpperCase()}</h2>
            <a href="/menu" className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm font-semibold uppercase whitespace-nowrap transition-colors hover:text-blue-800 dark:hover:text-blue-300">VIEW ALL</a>
          </div>
          <div className={`${CARD_ROW} overflow-x-auto scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth`}>
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
                className={`${CARD_SHELL} snap-start shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
              >
                <div className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 flex items-center justify-center h-24 sm:h-36 md:h-40">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.prod_name} loading="lazy" className="max-h-full max-w-full object-contain transition-transform duration-200 hover:scale-105"/>
                  ) : (
                    <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="p-2 sm:p-4 space-y-1 sm:space-y-2">
                  <span className="inline-block bg-red-800 text-white text-[9px] sm:text-xs font-semibold px-1 py-0.5 rounded leading-tight">
                    {category}
                  </span>
                  <p className="text-xs sm:text-base font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight min-h-[2rem] sm:min-h-[2.5rem]">{product.prod_name}</p>
                  <p className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">PHP {product.price.toFixed(2)}</p>
                </div>
                <div className="p-2 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddToCart(product)
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
                      handleBuyNow(product)
                    }}
                    className="w-full bg-[#0b2e59] hover:bg-[#15407a] active:bg-[#1a4f8f] text-white font-semibold py-2 sm:py-2.5 rounded-md text-[10px] sm:text-sm transition-all duration-200 min-h-[34px] sm:min-h-[40px] hover:shadow-sm active:scale-[0.98]"
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
