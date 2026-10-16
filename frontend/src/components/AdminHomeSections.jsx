import React, { useCallback, useEffect, useMemo, useState } from "react"
import supabase from "../lib/supabase"
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from "../lib/api.js"
import { AdminPage, StatusPill, EmptyState, btnPrimary, btnGhost, ConfirmDialog } from "./adminTheme.jsx"
import ProductPicker from "./ProductPicker.jsx"
import ContentHistoryDialog from "./ContentHistoryDialog.jsx"
import {
  useSelection, useLongPress, useReorderDrag, RowCheckBox, SelectionBar, SelectAllRow,
  GripHandle, bulkApply, bulkSummary, barBtnAccent, barBtnDanger, barBtnPlain,
} from "./adminBulk.jsx"

// Label registry for section cards. Only types with renders:true are offered
// in the create dialog; the home page currently renders product_row only.
// The hero, brand strip, promo strip and announcement live on the Banners page.
const TYPES = [
  { value: "product_row", label: "Product row", renders: true },
  { value: "hero_carousel", label: "Hero carousel", renders: false },
  { value: "category_tiles", label: "Category tiles", renders: false },
  { value: "promo_banner", label: "Promo banner", renders: false },
  { value: "text_block", label: "Text block", renders: false },
  { value: "brand_strip", label: "Brand strip", renders: false },
]

const RULES = [
  { value: "manual", label: "Hand-picked products" },
  { value: "category", label: "All products in a category" },
  { value: "brand", label: "All products of a brand" },
  { value: "newest", label: "Newest products" },
]

function statusOf(s) {
  if (s.status === "draft") return { kind: "neutral", label: "Draft" }
  if (s.status === "scheduled") return { kind: "info", label: "Scheduled" }
  return { kind: "success", label: "Published" }
}

function parseConfig(section) {
  const rule = String(section?.config?.rule || "manual")
  if (rule === "newest") return { kind: "newest", name: "", product_ids: section?.config?.product_ids || [] }
  if (rule.startsWith("category:")) return { kind: "category", name: rule.slice(9), product_ids: [] }
  if (rule.startsWith("brand:")) return { kind: "brand", name: rule.slice(6), product_ids: [] }
  return { kind: "manual", name: "", product_ids: section?.config?.product_ids || [] }
}

function ruleSummary(section) {
  const { kind, name, product_ids } = parseConfig(section)
  if (kind === "manual") return `Hand-picked (${product_ids.length})`
  if (kind === "newest") return "Newest products"
  return `${kind === "category" ? "Category" : "Brand"}: ${name}`
}

function fmtDate(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function toLocalInput(ts) {
  if (!ts) return ""
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SectionDialog({ initial, onClose, onSubmit }) {
  const parsed = initial ? parseConfig(initial) : { kind: "newest", name: "", product_ids: [] }
  const [form, setForm] = useState({
    type: initial?.type || "product_row",
    title: initial?.title || "",
    rule: parsed.kind,
    name: parsed.name,
    product_ids: parsed.product_ids,
    status: initial?.status || "draft",
    starts_at: toLocalInput(initial?.starts_at),
    ends_at: toLocalInput(initial?.ends_at),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // real category / brand names from the catalog, so nobody types them by hand
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  useEffect(() => {
    let cancelled = false
    Promise.all([apiGet("/products/categories"), apiGet("/products/brands")])
      .then(([c, b]) => {
        if (cancelled) return
        setCategories(c.items || [])
        setBrands(b.items || [])
      })
      .catch(() => { /* dropdowns keep just the saved value */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isRow = form.type === "product_row"

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      let config = {}
      if (isRow) {
        config = form.rule === "manual"
          ? { rule: "manual", product_ids: form.product_ids }
          : form.rule === "newest"
            ? { rule: "newest" }
            : { rule: form.rule, name: form.name.trim() }
      }
      await onSubmit({
        type: form.type,
        title: form.title.trim(),
        config,
        status: form.status,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      })
    } catch (err) {
      setError(err.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const toggleProduct = (id) => setForm((f) => ({
    ...f,
    product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id],
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={initial ? "Edit section" : "New product row"}>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 w-full h-full cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-[#16283f] shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-slate-100 tracking-tight">{initial ? "Edit section" : "New product row"}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Product rows appear as titled shelves of products on the home page. The hero, brand tiles, promo strip and announcement live under Banners.</p>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="sec-title" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Title <span className="text-red-500">*</span>
              </label>
              <input id="sec-title" type="text" required maxLength={80} value={form.title} onChange={set("title")} aria-required="true" placeholder="Row heading shoppers see"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            {isRow && (
              <div>
                <label htmlFor="sec-rule" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which products?</label>
                <select id="sec-rule" value={form.rule} onChange={set("rule")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100">
                  {RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            {isRow && (form.rule === "category" || form.rule === "brand") && (
              <div>
                <label htmlFor="sec-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">{form.rule === "category" ? "Which category?" : "Which brand?"}</label>
                <select
                  id="sec-name"
                  required
                  value={form.name}
                  onChange={set("name")}
                  aria-required="true"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="">Choose {form.rule === "category" ? "a category" : "a brand"}…</option>
                  {(form.rule === "category" ? categories : brands).map((n) => <option key={n} value={n}>{n}</option>)}
                  {form.name && !(form.rule === "category" ? categories : brands).includes(form.name) && (
                    <option value={form.name}>{form.name} (saved)</option>
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  {form.rule === "category" ? "Every product in this category appears in the row." : "Every product of this brand appears in the row."}
                </p>
              </div>
            )}
            {isRow && form.rule === "manual" && (
              <ProductPicker selected={form.product_ids} onToggle={toggleProduct} />
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="sec-status" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Status</label>
                <select id="sec-status" value={form.status} onChange={set("status")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100">
                  <option value="draft">Draft (hidden)</option>
                  <option value="published">Published (live)</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
              <div>
                <label htmlFor="sec-starts" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Starts at</label>
                <input id="sec-starts" type="datetime-local" value={form.starts_at} onChange={set("starts_at")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
              </div>
              <div>
                <label htmlFor="sec-ends" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Ends at</label>
                <input id="sec-ends" type="datetime-local" value={form.ends_at} onChange={set("ends_at")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
              </div>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">Cancel</button>
            <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? "Saving…" : initial ? "Save changes" : "Create draft"}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SectionCard({ section, index, total, onMove, onEdit, onArchive, busy, selected, onToggleSelect, dragHandleProps, dragging, dragOver }) {
  const typeMeta = TYPES.find((t) => t.value === section.type)
  // long-press the card (not its buttons/inputs) to select it
  const longPress = useLongPress(() => onToggleSelect())
  const ring = selected || dragging
    ? "border-[#0b2e59] ring-2 ring-[#0b2e59]/50 dark:border-yellow-400 dark:ring-yellow-400/50"
    : dragOver
      ? "border-[#0b2e59] ring-2 ring-[#0b2e59]/25 dark:border-yellow-400 dark:ring-yellow-400/25"
      : "border-gray-200 dark:border-[#2c4a6f]"
  return (
    <div
      {...longPress}
      data-sort-index={index}
      className={`rounded-2xl border bg-white dark:bg-[#16283f] p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition ${ring} ${dragging ? "opacity-60" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <RowCheckBox checked={selected} onChange={onToggleSelect} label={`Select section ${section.title}`} />
          <StatusPill kind={statusOf(section).kind}>{statusOf(section).label}</StatusPill>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">{typeMeta?.label || section.type}</span>
          <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{section.title}</span>
          <span className="text-xs text-gray-500 dark:text-slate-400">#{index + 1} of {total}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{ruleSummary(section)}</p>
        {(section.starts_at || section.ends_at) && (
          <p className="text-xs text-gray-500 dark:text-slate-400">{fmtDate(section.starts_at) || "now"} → {fmtDate(section.ends_at) || "no end"}</p>
        )}
        {!typeMeta?.renders && (
          <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">Not rendered on the home page yet.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {dragHandleProps && <GripHandle handleProps={dragHandleProps} />}
        <button type="button" onClick={() => onMove(section, -1)} disabled={busy || index === 0} aria-label={`Move ${section.title} up`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↑</button>
        <button type="button" onClick={() => onMove(section, 1)} disabled={busy || index === total - 1} aria-label={`Move ${section.title} down`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↓</button>
        <button type="button" onClick={() => onEdit(section)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">Edit</button>
        <button type="button" onClick={() => onArchive(section)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50">Archive</button>
      </div>
    </div>
  )
}

function AdminHomeSections() {
  const [items, setItems] = useState([])
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [history, setHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState("")

  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  const sel = useSelection()
  // stable callbacks from useSelection - plain identifiers for the hooks below
  const pruneSelection = sel.prune
  const clearSelection = sel.clear

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/sections?archived=${archived}`, token)
      const rows = data.items || []
      setItems(rows)
      // drop ids that are no longer in this list (archived elsewhere, view changed)
      pruneSelection(rows.map((s) => s.id))
    } catch (err) {
      setError(err.message || "Failed to load sections")
    } finally { setLoading(false) }
  }, [archived, sessionToken, pruneSelection])

  useEffect(() => { load() }, [load])
  // a different view is a different list - never carry a selection across it
  useEffect(() => { clearSelection() }, [archived, clearSelection])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t) }, [toast])

  // archived rows belong to the restore list below, not to the reorder grid
  const visible = useMemo(() => (archived ? [] : items), [items, archived])
  const archivedRows = useMemo(() => items.filter((s) => s.archived_at), [items])
  const listRows = archived ? archivedRows : visible

  const allSelected = listRows.length > 0 && listRows.every((s) => sel.isSelected(s.id))
  const someSelected = listRows.some((s) => sel.isSelected(s.id))
  const onToggleAll = () => {
    if (allSelected) sel.clear()
    else sel.selectAll(listRows.map((s) => s.id))
  }
  const singleSelected = sel.count === 1 ? listRows.find((s) => sel.isSelected(s.id)) : null

  async function handleSubmitSection(payload) {
    const token = await sessionToken()
    if (dialog?.mode === "edit") {
      await apiPatchAuth(`/admin/sections/${dialog.item.id}`, payload, token)
      setToast("Section saved")
    } else {
      await apiPostAuth("/admin/sections", payload, token)
      setToast("Section created as draft")
    }
    setDialog(null); await load()
  }

  async function moveSectionTo(from, to) {
    if (from === to || to < 0 || to >= visible.length) return
    const ids = visible.map((s) => s.id)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth("/admin/sections/reorder", { ids }, token)
      await load()
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleMove(section, dir) {
    const i = visible.findIndex((s) => s.id === section.id)
    if (i < 0) return
    return moveSectionTo(i, i + dir)
  }

  // drag-to-reorder over the current list (live view only - archived has no order)
  const drag = useReorderDrag((from, to) => { moveSectionTo(from, to) })

  async function bulkStatus(status, action) {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiPatchAuth(`/admin/sections/${id}`, { status }, token))
      sel.clear()
      setToast(bulkSummary(action, res, "row"))
      await load()
    } catch (err) { setToast(err.message || "Update failed") } finally { setBusy(false) }
  }

  async function bulkArchive() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiDeleteAuth(`/admin/sections/${id}`, token))
      setConfirm(null)
      sel.clear()
      setToast(bulkSummary("Archived", res, "row"))
      await load()
    } catch (err) { setConfirm(null); setToast(err.message || "Archive failed") } finally { setBusy(false) }
  }

  async function bulkRestore() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiPostAuth(`/admin/sections/${id}/restore`, {}, token))
      sel.clear()
      setToast(bulkSummary("Restored", res, "row"))
      await load()
    } catch (err) { setToast(err.message || "Restore failed") } finally { setBusy(false) }
  }

  async function handleArchive() {
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiDeleteAuth(`/admin/sections/${confirm.item.id}`, token)
      setConfirm(null); setToast("Section archived"); await load()
    } catch (err) { setConfirm(null); setToast(err.message) } finally { setBusy(false) }
  }

  async function handleRestore(section) {
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth(`/admin/sections/${section.id}/restore`, {}, token)
      setToast("Section restored"); await load()
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleRestoreDefaults() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await apiPostAuth("/admin/content/restore-defaults", { scope: "home_sections" }, token)
      setConfirmRestore(false)
      setToast(`Restored ${res.restored} default row${res.restored === 1 ? "" : "s"} (${res.archived} previous archived)`)
      await load()
    } catch (err) { setConfirmRestore(false); setToast(err.message) } finally { setBusy(false) }
  }

  return (
    <AdminPage title="Home Sections" subtitle="Product rows on the home page, in order. The hero, brand tiles, promo strip and announcement are managed under Banners. New rows start as drafts.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.open("/?scPreview=1", "_blank")} className={btnGhost}>Preview storefront</button>
          <button type="button" onClick={() => setHistory(true)} className={btnGhost}>History</button>
          <button type="button" onClick={() => setConfirmRestore(true)} disabled={busy} className={`${btnGhost} border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300 disabled:opacity-50`}>
            Restore default rows
          </button>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-gray-300" />
            Show archived
          </label>
          <button type="button" onClick={() => setDialog({ mode: "create" })} className={`${btnPrimary} whitespace-nowrap`}>New section</button>
        </div>
      </div>

      {toast && <div role="status" className="mb-4 rounded-lg border border-[#0b2e59]/30 bg-[#0b2e59]/10 px-4 py-2 text-sm font-semibold text-[#0b2e59] dark:border-yellow-400/30 dark:bg-yellow-400/10 dark:text-yellow-200">{toast}</div>}
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
          <button type="button" onClick={load} className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300 underline">Retry</button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <SelectAllRow allSelected={allSelected} someSelected={someSelected} onToggle={onToggleAll} total={listRows.length} noun="row" />
          <SelectionBar count={sel.count} onClear={sel.clear}>
            {archived ? (
              <button type="button" onClick={bulkRestore} disabled={busy} className={`${barBtnAccent} min-h-[36px]`}>
                Restore {sel.count}
              </button>
            ) : (
              <>
                {singleSelected && (
                  <button type="button" onClick={() => setDialog({ mode: "edit", item: singleSelected })} className={`${barBtnPlain} min-h-[36px]`}>
                    Edit
                  </button>
                )}
                <button type="button" onClick={() => bulkStatus("published", "Published")} disabled={busy} className={`${barBtnAccent} min-h-[36px]`}>
                  Publish {sel.count}
                </button>
                <button type="button" onClick={() => bulkStatus("draft", "Drafted")} disabled={busy} className={`${barBtnPlain} min-h-[36px]`}>
                  Draft {sel.count}
                </button>
                <button type="button" onClick={() => setConfirm({ mode: "bulk" })} disabled={busy} className={`${barBtnDanger} min-h-[36px]`}>
                  Archive {sel.count}
                </button>
              </>
            )}
          </SelectionBar>
        </>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] h-20 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        error ? null : (
          <EmptyState
            title={archived ? "No archived sections" : "No home sections yet"}
            message={archived ? "Archived sections can be restored." : "Create the first product row. It stays a draft until you publish it."}
          />
        )
      ) : (
        <div className="space-y-3">
          {visible.map((s, i) => (
            <SectionCard
              key={s.id}
              section={s}
              index={i}
              total={visible.length}
              busy={busy}
              selected={sel.isSelected(s.id)}
              onToggleSelect={() => sel.toggle(s.id)}
              dragHandleProps={drag.handleProps(i)}
              dragging={drag.isDragging(i)}
              dragOver={drag.isOver(i)}
              onMove={handleMove}
              onEdit={(item) => setDialog({ mode: "edit", item })}
              onArchive={(item) => setConfirm({ item })}
            />
          ))}
        </div>
      )}

      {archived && items.length > 0 && (
        <div className="mt-4 space-y-2">
          {archivedRows.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 dark:border-[#2c4a6f] px-4 py-2">
              <label className="flex min-w-0 items-center gap-2 cursor-pointer">
                <RowCheckBox checked={sel.isSelected(s.id)} onChange={() => sel.toggle(s.id)} label={`Select section ${s.title}`} />
                <span className="text-xs text-gray-500 dark:text-slate-400 truncate">{s.title}</span>
              </label>
              <button type="button" onClick={() => handleRestore(s)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-50">Restore</button>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <SectionDialog
          initial={dialog.item}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmitSection}
        />
      )}
      {confirm && (
        <ConfirmDialog
          open
          danger
          busy={busy}
          title={confirm.mode === "bulk" ? `Archive ${sel.count} rows?` : "Archive section?"}
          message="The home page stops rendering it immediately. You can restore it from the archived view."
          confirmLabel="Archive"
          onConfirm={() => (confirm.mode === "bulk" ? bulkArchive() : handleArchive())}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirmRestore && (
        <ConfirmDialog
          open
          danger
          busy={busy}
          title="Restore default rows?"
          message="Archives every home row and puts the six built-in draft placeholders back. Your rows stay restorable from Show archived, and nothing is deleted."
          confirmLabel="Restore defaults"
          onConfirm={handleRestoreDefaults}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
      {history && <ContentHistoryDialog entity="sections" onClose={() => setHistory(false)} />}
    </AdminPage>
  )
}

export default AdminHomeSections
