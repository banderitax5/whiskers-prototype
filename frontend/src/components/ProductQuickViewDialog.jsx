import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

// full screen product dialog that pops up when you click on a product card
// uses createPortal to render directly on document.body so it always covers
// the entire viewport no matter where the component sits in the tree
// press Escape or click the dark backdrop to close it
function ProductQuickViewDialog({ product, isOpen, onClose, onAddToCart, onBuyNow }) {
  const [qty, setQty] = useState(1)
  // normalize field names so the dialog works with both API products and hardcoded ones
  const p = product ? {
    ...product,
    name: product.name || product.prod_name,
    image: product.image || product.image_url,
    collection: product.collection || product.category,
  } : null
  const safePrice = Number(p?.price) || 0

  // reset quantity back to 1 every time a new product is opened
  useEffect(() => {
    if (isOpen) setQty(1)
  }, [isOpen, p?.id])

  // when the dialog is open, listen for the Escape key and lock body scroll
  // cleanup removes the listener and unlocks scroll when the dialog closes
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const previews = useMemo(() => {
    if (!p?.image) return []
    return [p.image, p.image, p.image]
  }, [p?.image])

  if (!isOpen || !p) return null

  function increase() { setQty((v) => v + 1) }
  function decrease() { setQty((v) => Math.max(1, v - 1)) }

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative mx-2 my-4 w-full max-w-4xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl sm:mx-6 sm:my-6">
        {/* close button in the top right corner */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition hover:bg-gray-200 dark:hover:bg-gray-600"
          aria-label="Close product details"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* two column layout: images on the left, product info on the right */}
        {/* collapses to a single column on mobile */}
        <div className="grid grid-cols-1 gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-2">
          <div className="flex gap-3">
            {/* thumbnail previews on the side, hidden on small screens to save space */}
            <div className="hidden flex-col gap-2 sm:flex">
              {previews.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 transition hover:border-[#0b2e59]"
                >
                  <img src={img} alt={`${p.name} preview ${idx + 1}`} className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
            {/* main product image */}
            <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-4">
              <img src={p.image} alt={p.name} loading="lazy" className="max-h-[220px] w-full object-contain sm:max-h-[280px]" />
            </div>
          </div>

          {/* product details, price, description, quantity picker, and action buttons */}
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{p.name}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{p.brand || p.collection || 'Whiskers'}</p>
            <p className="mt-3 text-3xl font-bold text-[#e4406a]">PHP {safePrice.toFixed(2)}</p>
            <p className="text-sm text-gray-400 line-through">PHP {(safePrice * 1.12).toFixed(2)} (SRP)</p>

            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Description</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {p.description || 'No description available for this product yet.'}
              </p>
            </div>

            {/* quantity stepper: minus button, current qty, plus button */}
            <div className="mt-5 flex items-center gap-1">
              <button type="button" onClick={decrease} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-lg font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-gray-700">-</button>
              <div className="flex h-10 min-w-[48px] items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{qty}</div>
              <button type="button" onClick={increase} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-lg font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-gray-700">+</button>
            </div>

            {/* add to cart and buy now buttons side by side */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
              <button type="button" onClick={() => onAddToCart(product, qty)} className="h-10 rounded-lg bg-yellow-400 text-xs font-bold text-gray-900 transition hover:bg-yellow-500 active:bg-yellow-600 sm:h-12 sm:text-sm">
                Add to Cart
              </button>
              <button type="button" onClick={() => onBuyNow(product, qty)} className="h-10 rounded-lg bg-[#0b2e59] text-xs font-bold text-white transition hover:bg-[#15407a] sm:h-12 sm:text-sm">
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ProductQuickViewDialog
