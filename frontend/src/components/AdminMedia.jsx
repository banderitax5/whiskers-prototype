import React, { useCallback, useEffect, useMemo, useState } from "react"
import { AdminPage, StatusPill, EmptyState, btnPrimary, ConfirmDialog } from "./adminTheme.jsx"
import supabase from "../lib/supabase"
import { apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth, apiUploadAuth } from "../lib/api.js"
import {
  useSelection, useLongPress, RowCheckBox, SelectionBar, SelectAllRow,
  bulkApply, bulkSummary, barBtnAccent, barBtnDanger, barBtnPlain,
} from "./adminBulk.jsx"

const PAGE_SIZE = 12

function formatBytes(n) {
  if (!n && n !== 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts) {
  if (!ts) return "—"
  return new Date(ts).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
}

// dialog used for upload and alt-text editing; shares the focus trap pattern
function MediaDialog({ title, submitLabel, initial, onSubmit, onClose }) {
  const [altText, setAltText] = useState(initial?.altText || "")
  const [file, setFile] = useState(null)
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const needsFile = !initial

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    if (!altText.trim()) { setError("Alt text is required so screen readers can describe the image."); return }
    if (needsFile && !file && !imageUrl.trim()) { setError("Choose an image file or paste an image URL."); return }
    setSaving(true)
    try {
      await onSubmit({ altText: altText.trim(), file, imageUrl: imageUrl.trim() || undefined })
    } catch (err) {
      setError(err.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 w-full h-full cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#16283f] shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-slate-100 tracking-tight">{title}</h2>
          {needsFile && (
            <>
              <label htmlFor="media-file" className="block mt-4 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Image file
              </label>
              <input
                id="media-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                aria-describedby="media-file-hint"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
              />
              <p id="media-file-hint" className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                JPG, PNG, WebP or GIF, up to 5MB. Banners work best at 1600×600; images are resized to 1200px wide.
              </p>
              <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">or paste an image URL (optional)</p>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                aria-label="Image URL"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
              />
            </>
          )}
          <label htmlFor="media-alt" className="block mt-4 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
            Alt text <span className="text-red-500">*</span>
          </label>
          <input
            id="media-alt"
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Describe what the image shows"
            maxLength={200}
            aria-required="true"
            className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Shown to screen readers and if the image fails to load. Keep it short and descriptive.
          </p>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>
              {saving ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MediaCard({ item, onEdit, onArchive, onRestore, onCheck, busy, selected, onToggleSelect }) {
  const [imgFailed, setImgFailed] = useState(false)
  // long-press anywhere on the card (except buttons/inputs) to select it
  const longPress = useLongPress(() => onToggleSelect())
  return (
    <div
      {...longPress}
      className={`rounded-2xl border overflow-hidden flex flex-col transition ${
        selected
          ? "border-[#F28C28] ring-2 ring-[#F28C28]/60"
          : "border-gray-200 dark:border-[#2c4a6f]"
      } bg-white dark:bg-[#16283f]`}
    >
      <div className="relative aspect-video bg-gray-100 dark:bg-[#0f2036]">
        {imgFailed ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-red-500 dark:text-red-400">Image failed to load</div>
        ) : (
          <img
            src={item.url}
            alt={item.alt_text}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        )}
        {item.is_broken && (
          <span className="absolute top-2 left-2"><StatusPill kind="danger">Broken</StatusPill></span>
        )}
        {item.archived_at && (
          <span className="absolute top-2 right-2"><StatusPill kind="neutral">Archived</StatusPill></span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <RowCheckBox checked={selected} onChange={onToggleSelect} label={`Select image ${item.alt_text}`} />
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 line-clamp-2" title={item.alt_text}>{item.alt_text}</p>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {[item.width && item.height ? `${item.width}×${item.height}` : null, formatBytes(item.size_bytes), formatDate(item.created_at)].filter(Boolean).join(" · ")}
        </p>
        {item.used_in?.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Used by:</span>{" "}
            {item.used_in.map((u, i) => (
              <span key={`${u.entity}-${u.id}-${i}`} className="inline-block mr-1">{u.label}{i < item.used_in.length - 1 ? "," : ""}</span>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {item.archived_at ? (
            <button type="button" onClick={() => onRestore(item)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-50">
              Restore
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onEdit(item)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">
                Edit alt
              </button>
              <button type="button" onClick={() => onCheck(item)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-50">
                Check
              </button>
              <button type="button" onClick={() => onArchive(item)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50">
                Archive
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AdminMedia() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [qInput, setQInput] = useState("")
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState(null) // { mode: 'upload' } | { mode: 'edit', item }
  const [confirm, setConfirm] = useState(null) // { mode: 'archive'|'force', item }
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState("")

  const sel = useSelection()
  // stable callbacks from useSelection - destructured so the hooks below
  // depend on plain identifiers (and never re-run on unrelated renders)
  const pruneSelection = sel.prune
  const clearSelection = sel.clear

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), archived: String(archived) })
      if (q) params.set("q", q)
      const { data: { session } } = await supabase.auth.getSession()
      const data = await apiGetAuth(`/admin/media?${params}`, session?.access_token)
      const rows = data.items || []
      setItems(rows)
      setTotal(data.total ?? 0)
      // drop ids that are no longer in this view (archived elsewhere, new page)
      pruneSelection(rows.map((r) => r.id))
    } catch (err) {
      setError(err.message || "Failed to load media")
    } finally { setLoading(false) }
  }, [page, q, archived, pruneSelection])

  useEffect(() => { load() }, [load])

  // a different view is a different list - never carry a selection across it
  useEffect(() => { clearSelection() }, [page, q, archived, clearSelection])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(""), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages
  const headerControls = useMemo(() => (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(qInput.trim()) }}
        className="flex gap-2"
        role="search"
      >
        <label htmlFor="media-search" className="sr-only">Search media by alt text</label>
        <input
          id="media-search"
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search alt text…"
          className="rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] px-3 py-1.5 text-sm text-gray-900 dark:text-slate-100"
        />
        <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">
          Search
        </button>
      </form>
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap">
        <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1) }} className="rounded border-gray-300" />
        Show archived
      </label>
      <button type="button" onClick={() => setDialog({ mode: "upload" })} className={`${btnPrimary} whitespace-nowrap`}>
        Upload image
      </button>
    </div>
  ), [qInput, archived])

  const visibleIds = items.map((i) => i.id)
  const allSelected = items.length > 0 && items.every((i) => sel.isSelected(i.id))
  const someSelected = items.some((i) => sel.isSelected(i.id))
  const onToggleAll = () => { if (allSelected) sel.clear(); else sel.selectAll(visibleIds) }
  const singleSelected = sel.count === 1 ? items.find((i) => sel.isSelected(i.id)) : null

  async function bulkArchive() {
    setBusy(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await bulkApply([...sel.selected], (id) => apiDeleteAuth(`/admin/media/${id}`, token))
      setConfirm(null)
      sel.clear()
      setToast(bulkSummary("Archived", res, "image"))
      await load()
    } catch (err) { setToast(err.message || "Archive failed") } finally { setBusy(false) }
  }

  async function bulkRestore() {
    setBusy(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await bulkApply([...sel.selected], (id) => apiPostAuth(`/admin/media/${id}/restore`, {}, token))
      sel.clear()
      setToast(bulkSummary("Restored", res, "image"))
      await load()
    } catch (err) { setToast(err.message || "Restore failed") } finally { setBusy(false) }
  }

  async function handleUpload({ altText, file, imageUrl }) {
    if (file) {
      const fd = new FormData()
      fd.append("image", file)
      fd.append("altText", altText)
      const { item } = await apiUploadAuth("/admin/media", fd, (await supabase.auth.getSession()).data.session?.access_token)
      setToast(`Uploaded ${item.url.split("/").pop()}`)
    } else {
      await apiPostAuth("/admin/media", { imageUrl, altText }, (await supabase.auth.getSession()).data.session?.access_token)
      setToast("Added image from URL")
    }
    setDialog(null); setPage(1); await load()
  }

  async function handleEdit({ altText }) {
    const { item } = await apiPatchAuth(`/admin/media/${dialog.item.id}`, { altText }, (await supabase.auth.getSession()).data.session?.access_token)
    setItems((prev) => prev.map((m) => (m.id === item.id ? item : m)))
    setDialog(null); setToast("Alt text updated")
  }

  async function handleArchive(force) {
    setBusy(true)
    try {
      await apiDeleteAuth(`/admin/media/${confirm.item.id}${force ? "?force=true" : ""}`, (await supabase.auth.getSession()).data.session?.access_token)
      setConfirm(null); setToast("Image archived"); await load()
    } catch (err) {
      // 409 means the image is still referenced - offer the forced path
      if (/in use/i.test(err.message)) {
        setConfirm({ mode: "force", item: confirm.item })
      } else {
        setConfirm(null); setToast(err.message)
      }
    } finally { setBusy(false) }
  }

  async function handleRestore(item) {
    setBusy(true)
    try {
      await apiPostAuth(`/admin/media/${item.id}/restore`, {}, (await supabase.auth.getSession()).data.session?.access_token)
      setToast("Image restored"); await load()
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleCheck(item) {
    setBusy(true)
    try {
      const { item: fresh } = await apiPostAuth(`/admin/media/${item.id}/check`, {}, (await supabase.auth.getSession()).data.session?.access_token)
      setItems((prev) => prev.map((m) => (m.id === fresh.id ? fresh : m)))
      setToast(fresh.is_broken ? "Image is broken - replace it soon" : "Image loads fine")
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  return (
    <AdminPage
      title="Media Library"
      subtitle="Every banner, slide and icon image. Required alt text keeps the storefront accessible."
    >
      <div className="mb-4">{headerControls}</div>
      {toast && <div role="status" className="mb-4 rounded-lg border border-[#F28C28]/40 bg-[#F28C28]/10 px-4 py-2 text-sm font-semibold text-[#a35b0c] dark:text-[#F9B671]">{toast}</div>}
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
          <button type="button" onClick={load} className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300 underline">Retry</button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <SelectAllRow allSelected={allSelected} someSelected={someSelected} onToggle={onToggleAll} total={items.length} noun="image" />
          <SelectionBar count={sel.count} onClear={sel.clear}>
            {archived ? (
              <button type="button" onClick={bulkRestore} disabled={busy} className={`${barBtnAccent} min-h-[36px]`}>
                Restore {sel.count}
              </button>
            ) : (
              <>
                {singleSelected && (
                  <button type="button" onClick={() => setDialog({ mode: "edit", item: singleSelected })} className={`${barBtnPlain} min-h-[36px]`}>
                    Edit alt
                  </button>
                )}
                <button type="button" onClick={() => setConfirm({ mode: "bulk" })} disabled={busy} className={`${barBtnDanger} min-h-[36px]`}>
                  Archive {sel.count}
                </button>
              </>
            )}
          </SelectionBar>
        </>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] overflow-hidden animate-pulse">
              <div className="aspect-video bg-gray-200 dark:bg-[#0f2036]" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-[#0f2036]" />
                <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-[#0f2036]" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        // never show "no images yet" when the load itself failed - the error
        // banner above explains the state instead
        error ? null : (
          <EmptyState
            title={q ? "No matching images" : archived ? "No archived images" : "No images yet"}
            message={q ? "Try a different search term." : "Upload the first banner or icon you want to use in the storefront."}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              busy={busy}
              selected={sel.isSelected(item.id)}
              onToggleSelect={() => sel.toggle(item.id)}
              onEdit={(m) => setDialog({ mode: "edit", item: m })}
              onArchive={(m) => setConfirm({ mode: "archive", item: m })}
              onRestore={handleRestore}
              onCheck={handleCheck}
            />
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <nav aria-label="Media pagination" className="mt-6 flex items-center justify-between">
          <button type="button" disabled={!hasPrev} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">
            Previous
          </button>
          <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Page {page} of {totalPages}</span>
          <button type="button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">
            Next
          </button>
        </nav>
      )}

      {dialog?.mode === "upload" && (
        <MediaDialog
          title="Upload image"
          submitLabel="Upload"
          onClose={() => setDialog(null)}
          onSubmit={handleUpload}
        />
      )}
      {dialog?.mode === "edit" && (
        <MediaDialog
          title="Edit alt text"
          submitLabel="Save"
          initial={{ altText: dialog.item.alt_text }}
          onClose={() => setDialog(null)}
          onSubmit={handleEdit}
        />
      )}
      {confirm && (
        <ConfirmDialog
          open
          danger
          busy={busy}
          title={confirm.mode === "bulk" ? `Archive ${sel.count} images?` : confirm.mode === "force" ? "Archive anyway?" : "Archive image?"}
          message={
            confirm.mode === "bulk"
              ? "Images still used by live content are skipped (you will see which). You can restore the rest later from the archived view."
              : confirm.mode === "force"
                ? "This image is still used by live content. Archiving it only hides it from the library - the broken reference stays until you replace it."
                : confirm.item?.used_in?.length
                  ? `Used by ${confirm.item.used_in.map((u) => u.label).join(", ")}.`
                  : "You can restore it later from the archived view."
          }
          confirmLabel={confirm.mode === "force" ? "Archive anyway" : "Archive"}
          onConfirm={() => (confirm.mode === "bulk" ? bulkArchive() : handleArchive(confirm.mode === "force"))}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  )
}

export default AdminMedia
