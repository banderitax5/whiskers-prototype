import React, { useCallback, useEffect, useState } from "react"
import supabase from "../lib/supabase"
import { apiGetAuth } from "../lib/api.js"

// Search-and-pick products by name. Returns the chosen ids to the parent,
// which stores them however the caller needs (banner link target, section
// product list, ...). Shared by the banner and home-section dialogs so both
// pick exactly the same way.
export default function ProductPicker({ selected = [], onToggle, max }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  useEffect(() => {
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const token = await sessionToken()
        const data = await apiGetAuth(`/admin/products?q=${encodeURIComponent(q)}&pageSize=8&active=true`, token)
        if (!cancelled) setResults(data.items || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, sessionToken])

  const atMax = Boolean(max) && selected.length >= max

  return (
    <div>
      <label htmlFor="prod-search" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Find products</label>
      <input
        id="prod-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type a product name…"
        className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
      />
      <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-[#2c4a6f] divide-y divide-gray-100 dark:divide-[#1e3a5f]">
        {searching && <li className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">Searching…</li>}
        {!searching && results.length === 0 && <li className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">No matches</li>}
        {!searching &&
          results.map((p) => {
            const on = selected.includes(p.prod_id)
            return (
              <li key={p.prod_id}>
                <button
                  type="button"
                  onClick={() => !atMax || on ? onToggle(p.prod_id) : null}
                  disabled={atMax && !on}
                  aria-pressed={on}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${on ? "bg-[#F28C28]/15 text-[#a35b0c] dark:text-[#F9B671]" : "text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1e3a5f]"}`}
                >
                  {on ? "✓ " : ""}
                  {p.prod_name}
                </button>
              </li>
            )
          })}
      </ul>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 self-center">
            {selected.length} picked{max ? ` (max ${max})` : ""}
          </span>
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              aria-label={`Remove product ${id.slice(0, 8)}`}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-[#1e3a5f] text-gray-700 dark:text-slate-200 hover:bg-red-100 dark:hover:bg-red-950/40 transition"
            >
              × {id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
