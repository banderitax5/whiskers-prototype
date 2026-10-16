import React, { useCallback, useEffect, useState } from "react"
import supabase from "../lib/supabase"
import { apiGetAuth } from "../lib/api.js"

// Pick an image from the Media Library instead of typing a file path.
// The stored value stays a plain URL/path (same as before) so nothing else
// in the system changes - only how the value gets chosen. A "paste a link"
// fallback stays for images that are not uploaded (e.g. brand art shipped
// with the site).
export default function ImagePicker({ label, value, onChange, required }) {
  const [mode, setMode] = useState("library") // library | url
  const [items, setItems] = useState([])
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/media?pageSize=48${q ? `&search=${encodeURIComponent(q)}` : ""}`, token)
      setItems(data.items || [])
      setFailed(false)
    } catch {
      setItems([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [q, sessionToken])

  useEffect(() => { load() }, [load])

  // a value that is not one of the library files (legacy /banner.png, a
  // remote URL) still deserves to be seen next to the picker
  const custom = value && !items.some((m) => m.url === value)

  return (
    <div className="rounded-lg border border-gray-200 dark:border-[#2c4a6f] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("library")}
            aria-pressed={mode === "library"}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${mode === "library" ? "bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900" : "text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f]"}`}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            aria-pressed={mode === "url"}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${mode === "url" ? "bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900" : "text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f]"}`}
          >
            Paste link
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => onChange("")}
              title="Remove this image"
              className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {mode === "url" ? (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          aria-required={required ? "true" : undefined}
          placeholder="/banner.png or https://…"
          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
        />
      ) : (
        <>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search uploaded images…"
            aria-label={`Search images for ${label}`}
            className="mt-2 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
          />
          {loading ? (
            <div className="mt-2 grid grid-cols-4 gap-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-video rounded bg-gray-100 dark:bg-[#1e3a5f] animate-pulse" />)}
            </div>
          ) : failed ? (
            <p className="mt-2 text-xs text-red-500 dark:text-red-400">Media Library could not be loaded — use “Paste link” instead.</p>
          ) : items.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              No images uploaded yet — add some in the{" "}
              <a href="/admin/media" className="font-semibold underline text-[#0b2e59] dark:text-yellow-300">Media Library</a>
              {" "}first, or use “Paste link”.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-2 max-h-48 overflow-y-auto" role="listbox" aria-label={`Images for ${label}`}>
              {items.map((m) => {
                const on = value === m.url
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onChange(on ? "" : m.url)}
                    title={m.alt_text || m.url}
                    className={`relative aspect-video rounded overflow-hidden border-2 transition ${on ? "border-[#0b2e59] ring-1 ring-[#0b2e59] dark:border-yellow-400 dark:ring-yellow-400" : "border-transparent hover:border-gray-300 dark:hover:border-[#2c4a6f]"}`}
                  >
                    <img src={m.url} alt={m.alt_text || ""} loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = "0.2" }} />
                    {on && <span className="absolute inset-0 flex items-center justify-center text-[#0b2e59] dark:text-yellow-400 text-lg font-black drop-shadow">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
          {custom && (
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              Current: <code className="break-all">{value}</code> (not in library — fine to keep or re-pick)
            </p>
          )}
        </>
      )}
    </div>
  )
}
