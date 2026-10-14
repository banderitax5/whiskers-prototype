import React, { useCallback, useEffect, useRef, useState } from "react"
import supabase from "../lib/supabase"
import { apiGetAuth } from "../lib/api.js"
import { btnGhost, StatusPill } from "./adminTheme.jsx"

const ACTION_KIND = {
  create: "success",
  update: "info",
  archive: "neutral",
  restore: "success",
  reorder: "neutral",
  reset: "progress",
  save: "info",
}

function actionLabel(action) {
  const map = {
    create: "Created",
    update: "Edited",
    archive: "Archived",
    restore: "Restored",
    reorder: "Reordered",
    reset: "Defaults restored",
    save: "Saved",
  }
  return map[action] || action
}

// "What changed on my storefront, and who did it" - reads site_content_history
// for one entity (banners / sections / nav_items / categories / media), newest
// first. Read-only on purpose: undo is each page's own archive/restore flow,
// so this dialog never mutates anything.
export default function ContentHistoryDialog({ entity, onClose }) {
  const [items, setItems] = useState(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const closeRef = useRef(null)
  const prevFocusRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error("Your session expired - sign in again")
      const res = await apiGetAuth(`/admin/content-history?entity=${encodeURIComponent(entity)}&pageSize=25`, token)
      setItems(res.items || [])
      setTotal(res.total || 0)
    } catch (err) {
      setError(err.message || "Failed to load history")
      setItems(null)
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => {
    prevFocusRef.current = document.activeElement
    closeRef.current?.focus()
    load()
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      prevFocusRef.current?.focus?.()
    }
  }, [load, onClose])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
        className="bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-[#1e3a5f] px-5 py-4">
          <div>
            <h3 id="history-dialog-title" className="text-sm sm:text-base font-black uppercase tracking-wide text-gray-900 dark:text-slate-100">
              Recent changes
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              {loading ? "Loading..." : `${total} recorded change${total === 1 ? "" : "s"} - newest first`}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className={btnGhost}>
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-2">
          {loading && (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] h-14 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
              <button type="button" onClick={load} className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300 underline">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && items && items.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">
              No recorded changes yet. Edits made from now on appear here with who made them.
            </p>
          )}

          {!loading &&
            !error &&
            items?.map((row) => (
              <details key={row.id} className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] px-3 py-2 group">
                <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-xs">
                  <StatusPill kind={ACTION_KIND[row.action] || "neutral"}>{actionLabel(row.action)}</StatusPill>
                  <span className="font-semibold text-gray-800 dark:text-slate-200">{row.actor || "Unknown"}</span>
                  <span className="text-gray-500 dark:text-slate-400">{new Date(row.created_at).toLocaleString()}</span>
                </summary>
                <pre className="mt-2 rounded-lg bg-gray-50 dark:bg-[#0a1829] p-2 text-[10px] leading-relaxed text-gray-700 dark:text-slate-300 overflow-x-auto">
                  {JSON.stringify(row.snapshot, null, 2)}
                </pre>
              </details>
            ))}
        </div>
      </div>
    </div>
  )
}
