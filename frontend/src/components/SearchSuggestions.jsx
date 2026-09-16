import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { BsSearch, BsClockHistory, BsFire, BsX } from 'react-icons/bs'

const RECENT_KEY = 'whiskers_recent_searches'
const MAX_RECENT = 5

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || []
  } catch { return [] }
}

function saveRecent(term) {
  const list = getRecent().filter((s) => s !== term)
  list.unshift(term)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
}

function clearRecent() {
  localStorage.removeItem(RECENT_KEY)
}

export default function SearchSuggestions({ className = '' }) {
  const navigate = useNavigate()
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState([])
  const [recentSearches, setRecentSearches] = useState(getRecent())

  useEffect(() => {
    async function load() {
      try {
        const { items } = await apiGet('/products?pageSize=500')
        setProducts(items || [])
      } catch { /* ignore */ }
    }
    load()
  }, [])

  useEffect(() => {
    setRecentSearches(getRecent())
  }, [open])

  // close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return products
      .filter((p) => (p.prod_name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [query, products])

  // popular: pick products from diverse categories (first of each)
  const popular = useMemo(() => {
    const seen = new Set()
    const picks = []
    for (const p of products) {
      const cat = p.category || 'Other'
      if (!seen.has(cat) && picks.length < 6) {
        seen.add(cat)
        picks.push(p)
      }
    }
    return picks
  }, [products])

  const categories = useMemo(() => {
    return [...new Set(products.map((p) => p.category).filter(Boolean))].sort().slice(0, 6)
  }, [products])

  function submit(term) {
    const t = term || query
    if (!t.trim()) return
    saveRecent(t.trim())
    setRecentSearches(getRecent())
    setQuery('')
    setOpen(false)
    navigate(`/menu?search=${encodeURIComponent(t.trim())}`)
  }

  function removeRecent(term) {
    const list = getRecent().filter((s) => s !== term)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
    setRecentSearches(list)
  }

  function selectProduct(p) {
    setOpen(false)
    setQuery('')
    navigate(`/menu?search=${encodeURIComponent(p.prod_name)}`)
  }

  const showDefault = !query.trim()

  return (
    <div ref={wrapperRef} className={`relative flex-1 hidden md:flex ${className}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="relative flex w-full max-w-2xl mx-auto">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search over 500 Pet products..."
          className="w-full h-11 px-5 rounded-l-full bg-white text-gray-800 placeholder-gray-400 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none"
        />
        <button
          type="submit"
          className="h-11 px-6 rounded-r-full bg-blue-700 text-white font-semibold hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 active:scale-95 transition-all duration-200"
        >
          Search
        </button>

        {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-[9999] overflow-hidden max-h-[70vh] overflow-y-auto">
          {showDefault ? (
            <div className="p-3 space-y-4">
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 flex items-center gap-1.5">
                      <BsClockHistory className="w-3 h-3" /> Recent
                    </span>
                    <button onClick={() => { clearRecent(); setRecentSearches([]) }} className="text-[10px] text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition">Clear all</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((s) => (
                      <button key={s} onClick={() => submit(s)} className="group flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-slate-300 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                        <BsClockHistory className="w-3 h-3 text-gray-400 dark:text-slate-500" />
                        {s}
                        <span onClick={(e) => { e.stopPropagation(); removeRecent(s) }} className="ml-0.5 text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"><BsX className="w-3 h-3" /></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular searches */}
              <div>
                <span className="block px-2 mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 flex items-center gap-1.5">
                  <BsFire className="w-3 h-3" /> Popular
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button key={cat} onClick={() => submit(cat)} className="px-3 py-1.5 rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-xs font-medium hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition">
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Popular products */}
              {popular.length > 0 && (
                <div>
                  <span className="block px-2 mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">Trending</span>
                  <div className="space-y-0.5">
                    {popular.map((p) => (
                      <button key={p.prod_id} onClick={() => selectProduct(p)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition text-left">
                        <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center shrink-0">
                          {p.image_url
                            ? <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                            : <BsSearch className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{p.prod_name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500">{p.category}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : results.length > 0 ? (
            <div className="p-2">
              <div className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                Products
              </div>
              {results.map((p) => (
                <button key={p.prod_id} onClick={() => selectProduct(p)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition text-left">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center shrink-0">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      : <BsSearch className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{p.prod_name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500">{p.category}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white shrink-0">PHP {Number(p.price || 0).toLocaleString()}</span>
                </button>
              ))}
              <button onClick={() => submit()} className="w-full mt-1 px-3 py-2 rounded-lg text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                View all results for &ldquo;{query}&rdquo;
              </button>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-400 dark:text-slate-500">
              No products found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
        )}
      </form>
    </div>
  )
}
