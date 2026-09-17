import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsSearch, BsX } from 'react-icons/bs'
import { apiGet } from '../lib/api'
import { trackEvent } from '../lib/appEvents.js'

export default function SearchModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiGet(`/products?search=${encodeURIComponent(query.trim())}&pageSize=10`)
        setResults(res.items || [])
        trackEvent('search', { query: query.trim(), results: (res.items || []).length })
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  function handleSelect(product) {
    onClose()
    navigate(`/menu?search=${encodeURIComponent(product.prod_name)}`)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[10001] bg-black/50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <BsSearch className="h-5 w-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, brands, categories..."
            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none text-base"
          />
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
            <BsX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="p-6 text-center text-sm text-gray-400">Searching...</div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">No results found</div>
          )}
          {!loading && results.map((product) => (
            <button
              key={product.prod_id}
              type="button"
              onClick={() => handleSelect(product)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left"
            >
              <div className="h-12 w-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <BsSearch className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{product.prod_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{product.category} &middot; PHP {product.price?.toFixed(2)}</p>
              </div>
            </button>
          ))}
          {!query.trim() && (
            <div className="p-6 text-center text-sm text-gray-400">Type to search across all products</div>
          )}
        </div>
      </div>
    </div>
  )
}
