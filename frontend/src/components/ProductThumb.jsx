import { useState } from 'react'

// product thumbnail with a graceful fallback when the image is missing
// or fails to load (U7). alt is intentionally empty because the surrounding
// card always carries the product name as text.
function ProductThumb({ src, className = 'h-16 w-16 sm:h-20 sm:w-20', imgClassName = 'h-12 w-12 sm:h-14 sm:w-14' }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-700 ${className}`} aria-hidden="true">
        <svg className="h-8 w-8 text-gray-300 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.09-.773 2.34-1.872l1.836-7.89a1.125 1.125 0 00-1.098-1.368H5.173M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      </div>
    )
  }

  return (
    <div className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-700 ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${imgClassName} object-contain`}
      />
    </div>
  )
}

export default ProductThumb
