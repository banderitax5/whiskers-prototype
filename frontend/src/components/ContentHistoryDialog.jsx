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

// owner-facing names for stored column keys - history reads like a sentence,
// never like a database dump
const FIELD_LABELS = {
  title: "Title",
  alt: "Image description",
  alt_text: "Image description",
  subtitle: "Subtitle",
  button_text: "Button label",
  link_type: "Link type",
  link_target: "Link destination",
  status: "Status",
  placement: "Placement",
  desktop_image_url: "Desktop image",
  mobile_image_url: "Mobile image",
  starts_at: "Starts",
  ends_at: "Ends",
  label: "Label",
  href: "Link",
  image_url: "Icon image",
  question: "Question",
  answer: "Answer",
  body: "Content",
  slug: "Page address",
  is_visible: "Visible",
  is_active: "Active",
  sort_order: "Order",
  type: "Type",
  config: "Settings",
  url: "File",
  storage_path: "File path",
  mime_type: "File type",
  size_bytes: "Size",
  is_broken: "Broken",
}

function humanField(key) {
  return String(key)
    .split(" · ")
    .map((part) => FIELD_LABELS[part] || part.replace(/_/g, " "))
    .join(" · ")
}

// one readable value: nulls/empties become "None", booleans Yes/No, ISO
// timestamps a short date, long text truncated (full value lives on the row)
function formatValue(v) {
  if (v === null || v === undefined || v === "") return "None"
  if (v === true) return "Yes"
  if (v === false) return "No"
  if (typeof v === "object") {
    const s = Array.isArray(v)
      ? v.map((x) => (x && typeof x === "object") ? JSON.stringify(x) : String(x)).join(", ") || "None"
      : JSON.stringify(v)
    return s.length > 140 ? `${s.slice(0, 140)}…` : s
  }
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    }
  }
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

// what the entry is called in the list header: explicit name (diff-style
// snapshots) or the identifying column of a full-row snapshot
function snapshotName(snap) {
  if (!snap || typeof snap !== "object") return null
  if (typeof snap.name === "string" && snap.name.trim()) return snap.name.trim()
  for (const k of ["title", "alt", "label", "question", "alt_text", "slug"]) {
    const v = snap[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

const NOISY_ROW_KEYS = new Set(["id", "created_at", "updated_at", "created_by", "impressions", "clicks", "name"])

function DiffList({ changes }) {
  const entries = Object.entries(changes)
  if (entries.length === 0) {
    return <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">No field changes - the saved values matched what was already there.</p>
  }
  return (
    <ul className="mt-2 space-y-1.5">
      {entries.map(([field, c]) => (
        <li key={field} className="text-xs leading-relaxed break-words">
          <span className="font-bold text-gray-800 dark:text-slate-200">{humanField(field)}</span>
          {": "}
          <span className="text-gray-500 dark:text-slate-400">{formatValue(c?.from)}</span>
          <span className="mx-1 font-black text-[#0b2e59] dark:text-yellow-400">&rarr;</span>
          <span className="font-semibold text-gray-900 dark:text-slate-100">{formatValue(c?.to)}</span>
        </li>
      ))}
    </ul>
  )
}

function OrderedList({ label, items, strong }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">{label}</p>
      <ol className={`mt-1 list-decimal list-inside space-y-0.5 text-xs ${strong ? "font-semibold text-gray-900 dark:text-slate-100" : "text-gray-600 dark:text-slate-300"}`}>
        {items.map((n, i) => <li key={i} className="break-words">{n}</li>)}
      </ol>
    </div>
  )
}

function KeyValueList({ snapshot }) {
  const entries = Object.entries(snapshot).filter(([k]) => !NOISY_ROW_KEYS.has(k))
  if (!entries.length) return null
  return (
    <ul className="mt-2 space-y-1">
      {entries.map(([k, v]) => (
        <li key={k} className="text-xs leading-relaxed break-words">
          <span className="font-bold text-gray-800 dark:text-slate-200">{humanField(k)}</span>
          {": "}
          <span className="text-gray-700 dark:text-slate-300">{formatValue(v)}</span>
        </li>
      ))}
    </ul>
  )
}

// renders one history snapshot in either shape: the new diff style
// ({ name, changes: { field: { from, to } } }) or a legacy full row / special
// payload (create rows and history recorded before 2026-10-15)
function SnapshotView({ snapshot }) {
  if (!snapshot || typeof snapshot !== "object") return null

  if (snapshot.changes && typeof snapshot.changes === "object") {
    return <DiffList changes={snapshot.changes} />
  }

  if (Array.isArray(snapshot.previous) || Array.isArray(snapshot.next)) {
    return (
      <div className="mt-2 space-y-2">
        <OrderedList label="Previous order" items={snapshot.previous} />
        <OrderedList label="New order" items={snapshot.next} strong />
      </div>
    )
  }

  if (Array.isArray(snapshot.items)) {
    // legacy categories batch snapshot
    return (
      <ul className="mt-2 space-y-1">
        {snapshot.items.map((it, i) => (
          <li key={i} className="text-xs leading-relaxed break-words">
            <span className="font-bold text-gray-800 dark:text-slate-200">{it?.name || "Category"}</span>
            {": "}
            {formatValue(it?.label)} &middot; order {formatValue(it?.sort_order)} &middot; {it?.is_visible ? "Visible" : "Hidden"}
          </li>
        ))}
      </ul>
    )
  }

  if (Array.isArray(snapshot.keys)) {
    // legacy settings snapshot (pre-diff)
    return <p className="mt-2 text-xs text-gray-700 dark:text-slate-300">Updated: {snapshot.keys.map(humanField).join(", ")}</p>
  }

  if (snapshot.archived !== undefined || Array.isArray(snapshot.archivedIds)) {
    // restore-defaults snapshot: counts + what came back (legacy rows carried
    // full inserted rows instead of names)
    const archivedN = snapshot.archived ?? (Array.isArray(snapshot.archivedIds) ? snapshot.archivedIds.length : 0)
    const restoredN = Array.isArray(snapshot.restored) ? snapshot.restored.length : (snapshot.restored ?? 0)
    const names = Array.isArray(snapshot.names)
      ? snapshot.names
      : (Array.isArray(snapshot.restored) ? snapshot.restored.map(snapshotName).filter(Boolean) : [])
    return (
      <div className="mt-2 text-xs text-gray-700 dark:text-slate-300 space-y-1">
        <p>
          Archived {archivedN} previous row{archivedN === 1 ? "" : "s"}, restored {restoredN} default row{restoredN === 1 ? "" : "s"}.
        </p>
        {names.length > 0 && <p className="text-gray-500 dark:text-slate-400">{names.join(", ")}</p>}
      </div>
    )
  }

  return <KeyValueList snapshot={snapshot} />
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
            items?.map((row) => {
              const name = snapshotName(row.snapshot)
              return (
                <details key={row.id} className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] px-3 py-2 group">
                  <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-xs">
                    <StatusPill kind={ACTION_KIND[row.action] || "neutral"}>{actionLabel(row.action)}</StatusPill>
                    {name && (
                      <span className="max-w-[45%] truncate font-bold text-gray-900 dark:text-slate-100" title={name}>
                        {name}
                      </span>
                    )}
                    <span className="font-semibold text-gray-800 dark:text-slate-200">{row.actor_name || row.actor || 'Unknown'}</span>
                    <span className="text-gray-500 dark:text-slate-400">{new Date(row.created_at).toLocaleString()}</span>
                  </summary>
                  <SnapshotView snapshot={row.snapshot} />
                </details>
              )
            })}
        </div>
      </div>
    </div>
  )
}
