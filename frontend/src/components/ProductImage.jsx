import { useState } from 'react'

// shared product image with a graceful fallback chain:
//   image_url -> placeholder icon (also used when the URL fails to load)
// Used by the quick view modal, the detail page, and the related strip so the
// "no image / broken image" behaviour is identical everywhere.
// The className controls the container; imgClassName controls the <img> itself.
function ProductImage({ src, alt, className = '', imgClassName = '', loading = 'lazy' }) {
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed

  return (
    <div className={`flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onError={() => setFailed(true)}
          className={`object-contain ${imgClassName}`}
        />
      ) : (
        <svg
          className="h-10 w-10 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      )}
    </div>
  )
}

export default ProductImage
