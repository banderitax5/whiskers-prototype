import { useState, useEffect, useCallback } from 'react'
import { apiGet } from '../lib/api.js'

function Stars({ rating, size = 20, interactive = false, onClick }) {
  return (
    <div className="flex items-center gap-0.5" role={interactive ? 'radiogroup' : 'img'} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-${size / 4} h-${size / 4} ${interactive ? 'cursor-pointer' : ''}`}
          fill={i <= rating ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
          onClick={() => interactive && onClick(i)}
          aria-label={`${i} star${i !== 1 ? 's' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ))}
    </div>
  )
}

function formatDate(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function ProductReviews({ productId }) {
  const [reviews, setReviews] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const pageSize = 10

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet(`/feedback/product/${productId}?page=${page}&pageSize=${pageSize}`)
      setReviews(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message || 'Could not load reviews')
    } finally {
      setLoading(false)
    }
  }, [productId, page, pageSize])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize) || 1

  if (loading && reviews.length === 0) {
    return (
      <section className="mt-8 sm:mt-10" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
          Reviews
        </h2>
        <div className="mt-3 space-y-3" aria-hidden="true">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="mt-8 sm:mt-10" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
          Reviews
        </h2>
        <div className="mt-3 text-center text-gray-500 dark:text-gray-400">
          <p>{error}</p>
          <button
            onClick={load}
            className="mt-2 text-sm text-[#0b2e59] dark:text-blue-400 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-8 sm:mt-10" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
        Reviews <span className="font-normal text-gray-500 dark:text-gray-400 text-sm">({total})</span>
      </h2>

      {reviews.length === 0 ? (
        <div className="mt-4 text-center text-gray-500 dark:text-gray-400 py-8">
          <p>No reviews yet. Be the first to share your experience!</p>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-5" role="list">
            {reviews.map((r) => (
              <li key={r.feed_id} className="border-b border-gray-200 dark:border-gray-700 pb-5 last:border-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <strong className="text-gray-900 dark:text-white">{r.reviewer_name}</strong>
                    <Stars rating={r.rating} size={16} />
                    <time className="text-xs text-gray-500 dark:text-gray-400" dateTime={r.date_submittted}>
                      {formatDate(r.date_submittted)}
                    </time>
                  </div>
                </div>
                {r.comments && (
                  <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {r.comments}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-1" aria-label="Reviews pagination">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                    p === page
                      ? 'bg-[#0b2e59] text-white'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}