import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import ProductQuickViewDialog from '../components/ProductQuickViewDialog.jsx'
import BannerLink from '../components/BannerLink.jsx'
import { apiGet } from '../lib/api.js'
import { attachSizeVariants } from '../lib/productUtils.js'
import { formatPesos } from '../lib/cartLogic'
import {
  fetchSiteContent,
  contentBanners,
  contentSections,
  resolveRowProducts,
  trackBannerEvent,
  isPreviewMode,
  exitPreview,
} from '../lib/siteContent.js'
import { contentPromos, saleFor } from '../lib/promoDisplay.js'

// built-in defaults: used whenever the content endpoint is not seeded yet
// (fresh install, migration not applied, request failed)
const CAROUSEL_SLIDES = [
  { image: '/banner.png', alt: 'Whiskers Pet Shop' },
  { image: '/categoryshop/dog.jpg', alt: 'Dog Food Collection' },
  { image: '/categoryshop/cat.jpg', alt: 'Cat Food Collection' },
  { image: '/categoryshop/fish.png', alt: 'Fish Supplies' },
  { image: '/categoryshop/berd.jpg', alt: 'Bird Supplies' },
]
const FALLBACK_CATEGORY_ROWS = 6

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
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const [content, setContent] = useState(null)

  // storefront content (banners, home sections): forced so an admin edit
  // shows on the next visit to the home page, not only after a hard
  // refresh; concurrent mounts share one request
  useEffect(() => {
    let cancelled = false
    fetchSiteContent(true).then((data) => { if (!cancelled) setContent(data) })
    return () => { cancelled = true }
  }, [])

  // hero slides: the banner table is the source of truth once content has
  // loaded. The built-in carousel only renders when content is not available
  // yet (fresh install / request failed); drafting every published slide
  // hides the carousel entirely, as expected.
  const heroSlides = useMemo(() => {
    if (!content) return CAROUSEL_SLIDES
    return (content.banners || [])
      .filter((b) => b.desktop_image_url)
      .map((b) => ({ image: b.desktop_image_url, alt: b.alt, id: b.id }))
  }, [content])

  // keep the active slide inside the list when drafts shrink it mid-mount
  useEffect(() => {
    setCurrentSlide((p) => (heroSlides.length === 0 ? 0 : p % heroSlides.length))
  }, [heroSlides.length])

  const activePromos = useMemo(() => contentPromos(content), [content])

  // home sections: published product rows from the section editor, otherwise
  // the derived category rows the page has always shown
  const rowSections = useMemo(() => contentSections(content, 'product_row'), [content])

  // banner above the product rows (editorial "category top" placement);
  // null when unpublished so the page keeps its usual look
  const catTop = useMemo(() => contentBanners(content, 'category_top')?.[0] ?? null, [content])

  // one impression per category-top banner when it actually shows
  useEffect(() => {
    if (catTop?.id) trackBannerEvent(catTop.id, 'impression')
  }, [catTop])

  // auto-rotate the hero, but pause on hover/focus (WCAG 2.2.2)
  useEffect(() => {
    if (heroPaused) return undefined
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % Math.max(1, heroSlides.length))
    }, 5000)
    return () => clearInterval(timer)
  }, [heroPaused, heroSlides.length])

  const goToSlide = useCallback((idx) => setCurrentSlide(idx), [])
  const prevSlide = useCallback(
    () => setCurrentSlide((p) => (p - 1 + heroSlides.length) % Math.max(1, heroSlides.length)),
    [heroSlides.length]
  )
  const nextSlide = useCallback(
    () => setCurrentSlide((p) => (p + 1) % Math.max(1, heroSlides.length)),
    [heroSlides.length]
  )

  // record one impression per hero slide when the banner table is driving it
  useEffect(() => {
    const slide = heroSlides[currentSlide]
    if (slide?.id) trackBannerEvent(slide.id, 'impression')
  }, [currentSlide, heroSlides])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadFailed(false)
      try {
        const res = await apiGet('/products?pageSize=500')
        setProducts(res.items || [])
      } catch (err) {
        console.error('Failed to load products:', err)
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [attempt])

  const enrichedProducts = useMemo(() => attachSizeVariants(products), [products])

  const groupedByCategory = enrichedProducts.reduce((acc, product) => {
    const cat = product.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(product)
    return acc
  }, {})

  // published sections win; otherwise the first six categories as before
  const fallbackRows = useMemo(
    () => Object.entries(groupedByCategory).slice(0, FALLBACK_CATEGORY_ROWS),
    [groupedByCategory]
  )

  // editor rows only replace the built-in ones when they actually show
  // products; a published row that resolves to nothing (empty rule match,
  // bad config) keeps the built-in rows so the home page never goes blank
  const visibleRows = useMemo(() => {
    if (!rowSections) return null
    const rows = rowSections
      .map((section) => ({
        key: section.id,
        title: section.title || '',
        products: resolveRowProducts(section, enrichedProducts),
      }))
      .filter((row) => row.products.length > 0)
    return rows.length > 0 ? rows : null
  }, [rowSections, enrichedProducts])

  const usingEditorRows = visibleRows !== null

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

  if (loadFailed) {
    return (
      <div className={SHELL}>
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

  if (products.length === 0) {
    return (
      <div className={SHELL}>
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">No products are available right now. Please check back soon.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={SHELL}>
      {isPreviewMode() && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 dark:border-blue-700 dark:bg-blue-950/40">
          <p className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-200">
            Preview mode - draft and scheduled content is visible. Shoppers still see the published site.
          </p>
          <button
            type="button"
            onClick={() => { exitPreview(); window.location.reload() }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-400 text-blue-800 dark:border-blue-600 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
          >
            Exit preview
          </button>
        </div>
      )}
      {heroSlides.length > 0 && (
      <section className="pt-2">
        <div
          className={`relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 ${HERO_HEIGHT}`}
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
          onFocus={() => setHeroPaused(true)}
          onBlur={() => setHeroPaused(false)}
        >
          {heroSlides.map((slide, idx) => (
            <div
              key={slide.image + idx}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${idx === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <img src={slide.image} alt={slide.alt} className="h-full w-full object-cover" />
            </div>
          ))}
          <button type="button" onClick={prevSlide} aria-label="Previous slide" className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-all duration-200 hover:scale-110">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={nextSlide} aria-label="Next slide" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-all duration-200 hover:scale-110">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7-7" /></svg>
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {heroSlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
        </div>
      </section>
      )}

      {catTop && (catTop.desktop_image_url || catTop.mobile_image_url || catTop.title) && (
        <div className="mt-4 sm:mt-6">
          <BannerLink
            banner={catTop}
            ariaLabel={catTop.title || catTop.alt || 'Featured banner'}
            className="group relative block overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800 h-24 sm:h-36 md:h-44"
          >
            <picture>
              {catTop.mobile_image_url && (
                <source media="(max-width: 640px)" srcSet={catTop.mobile_image_url} />
              )}
              {catTop.desktop_image_url ? (
                <img
                  src={catTop.desktop_image_url}
                  alt={catTop.alt || catTop.title || ''}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="h-full w-full bg-[#0b2e59]" />
              )}
            </picture>
            {(catTop.title || catTop.button_text) && (
              <div className="absolute inset-0 flex items-center justify-between gap-3 px-4 sm:px-6 bg-gradient-to-r from-black/50 via-black/20 to-transparent">
                <span className="text-white text-sm sm:text-lg md:text-xl font-bold drop-shadow truncate">
                  {catTop.title}
                </span>
                {catTop.button_text && (
                  <span className="shrink-0 rounded-full bg-[#ffd21e] text-[#0b2e59] text-[10px] sm:text-xs font-bold px-2.5 sm:px-4 py-1 sm:py-1.5 uppercase tracking-wide group-hover:brightness-95">
                    {catTop.button_text}
                  </span>
                )}
              </div>
            )}
          </BannerLink>
        </div>
      )}

      {(usingEditorRows
        ? visibleRows
        : fallbackRows.map(([category, catProducts]) => ({
            key: category,
            title: category.toUpperCase(),
            products: catProducts,
          }))
      ).map((row) => (
        <div key={row.key} className="mt-6 sm:mt-8 md:mt-10">
          <div className={HEADING_ROW}>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-wide">{row.title}</h2>
            <button type="button" onClick={() => navigate('/menu')} className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm font-semibold uppercase whitespace-nowrap transition-colors hover:text-blue-800 dark:hover:text-blue-300">VIEW ALL</button>
          </div>
          <div className={`${CARD_ROW} overflow-x-auto scrollbar-hide snap-x snap-mandatory touch-pan-x scroll-smooth`}>
            {row.products.slice(0, 7).map((product) => (
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
                    {usingEditorRows ? (product.category || 'Shop') : row.title}
                  </span>
                  <p className="text-xs sm:text-base font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight min-h-[2rem] sm:min-h-[2.5rem]">{product.prod_name}</p>
        {product.price > 0 ? (
          (() => {
            const sale = saleFor(product, activePromos)
            if (!sale) return <p className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">PHP {formatPesos(Number(product.price))}</p>
            return (
              <p className="text-sm sm:text-lg font-bold">
                <span className="text-gray-400 dark:text-gray-500 line-through font-normal text-xs sm:text-sm mr-1.5">PHP {formatPesos(Number(product.price))}</span>
                <span className="text-red-600 dark:text-red-400">PHP {formatPesos(sale.salePrice)}</span>
                <span className="ml-1.5 inline-block rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white align-middle">Sale −{sale.discountPct}%</span>
              </p>
            )
          })()
        ) : (
                    <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Price not yet set</p>
                  )}
                </div>
                <div className="p-2 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
                  <button
                    type="button"
                    disabled={!(product.price > 0)}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddToCart(product)
                    }}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900 font-semibold py-2 sm:py-2.5 rounded-md flex items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm transition-all duration-200 touch-manipulation min-h-[34px] sm:min-h-[40px] hover:shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    <svg className="w-3.5 h-3.5 sm:w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="whitespace-nowrap">{product.price > 0 ? 'ADD TO CART' : 'UNAVAILABLE'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!(product.price > 0)}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBuyNow(product)
                    }}
                    className="w-full bg-[#0b2e59] hover:bg-[#15407a] active:bg-[#1a4f8f] text-white font-semibold py-2 sm:py-2.5 rounded-md text-[10px] sm:text-sm transition-all duration-200 min-h-[34px] sm:min-h-[40px] hover:shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
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
