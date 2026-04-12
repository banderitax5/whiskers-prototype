import { useEffect, useMemo, useState } from 'react'

function ProductQuickViewDialog({ product, isOpen, onClose, onAddToCart, onBuyNow }) {
  const [qty, setQty] = useState(1)
  const safePrice = Number(product?.price) || 0

  useEffect(() => {
    if (isOpen) setQty(1)
  }, [isOpen, product?.id])

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
    if (!product?.image) return []
    return [product.image, product.image, product.image]
  }, [product?.image])

  if (!isOpen || !product) return null

  function increase() { setQty((v) => v + 1) }
  function decrease() { setQty((v) => Math.max(1, v - 1)) }

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative mx-4 my-6 w-full max-w-4xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl sm:mx-6">
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

        <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 md:grid-cols-2">
          <div className="flex gap-3">
            <div className="flex flex-col gap-2">
              {previews.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 transition hover:border-[#0b2e59]"
                >
                  <img src={img} alt={`${product.name} preview ${idx + 1}`} className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
            <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-4">
              <img src={product.image} alt={product.name} className="max-h-[280px] w-full object-contain" />
            </div>
          </div>

          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{product.name}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{product.brand || product.collection || 'Whiskers'}</p>
            <p className="mt-3 text-3xl font-bold text-[#e4406a]">PHP {safePrice.toFixed(2)}</p>
            <p className="text-sm text-gray-400 line-through">PHP {(safePrice * 1.12).toFixed(2)} (SRP)</p>

            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Description</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {product.description || 'No description available for this product yet.'}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">Available at:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-600 dark:text-gray-300">
                <li>Whiskers Main Branch</li>
                <li>Whiskers North Branch</li>
                <li>Whiskers Express Branch</li>
              </ul>
            </div>

            <div className="mt-5 flex items-center gap-1">
              <button type="button" onClick={decrease} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-lg font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-gray-700">-</button>
              <div className="flex h-10 min-w-[48px] items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{qty}</div>
              <button type="button" onClick={increase} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-lg font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-100 dark:hover:bg-gray-700">+</button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => onAddToCart(product, qty)} className="h-12 rounded-lg bg-yellow-400 text-sm font-bold text-gray-900 transition hover:bg-yellow-500 active:bg-yellow-600">
                Add to Cart
              </button>
              <button type="button" onClick={() => onBuyNow(product, qty)} className="h-12 rounded-lg bg-[#0b2e59] text-sm font-bold text-white transition hover:bg-[#15407a]">
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductQuickViewDialog
