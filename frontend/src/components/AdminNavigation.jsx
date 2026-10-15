import React, { useCallback, useEffect, useState } from "react"
import supabase from "../lib/supabase"
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from "../lib/api.js"
import { fetchSiteContent, contentPolicies } from "../lib/siteContent.js"
import { AdminPage, StatusPill, EmptyState, btnPrimary, btnGhost, ConfirmDialog } from "./adminTheme.jsx"
import ImagePicker from "./ImagePicker.jsx"
import ProductPicker from "./ProductPicker.jsx"
import ContentHistoryDialog from "./ContentHistoryDialog.jsx"
import {
  useSelection, useLongPress, useReorderDrag, RowCheckBox, SelectionBar, SelectAllRow,
  GripHandle, bulkApply, bulkSummary, barBtnAccent, barBtnDanger, barBtnPlain,
} from "./adminBulk.jsx"

// One page for everything the owner can edit about category links and
// footer/menu links. The four link groups mirror site_nav_items.section;
// Categories edits the override layer (label / order / visibility) that the
// Menu page's filter list is built from.
const TABS = [
  { key: "navbar", label: "Menu links", hint: "Links in the top navigation bar, shown left to right." },
  { key: "footer_shop", label: "Footer: Shop", hint: "The Shop column of the footer." },
  { key: "footer_account", label: "Footer: Account", hint: "The Account column of the footer." },
  { key: "footer_social", label: "Footer: Social", hint: "Social links in the footer. An icon image is optional; the built-in Instagram/Facebook icons show when it is empty." },
  { key: "categories", label: "Categories", hint: "The category filter list on the Menu page. Rename what shoppers see, reorder the list, or hide a category from the filter - hidden categories stay searchable and keep their product pages." },
]

// where a link can go - the picker composes the plain href the table stores,
// so the owner never types addresses or query strings (same idea as the
// banner dialog's link picker, adapted to nav rows which only store href)
const DEST_TYPES = [
  { value: "page", label: "A page on this site" },
  { value: "category", label: "A category" },
  { value: "brand", label: "A brand" },
  { value: "promo", label: "A promotion" },
  { value: "product", label: "A product" },
  { value: "website", label: "Another website" },
  { value: "custom", label: "Something else (advanced)" },
]

// shopper-facing pages; policy pages append once content loads
const SHOPPER_PAGES = [
  { href: "/", label: "Home page" },
  { href: "/menu", label: "Shop all products" },
  { href: "/cart", label: "Shopping cart" },
  { href: "/checkout", label: "Checkout" },
  { href: "/orders", label: "My orders (asks to sign in)" },
  { href: "/pets", label: "Pet recommendation (asks to sign in)" },
  { href: "/profile", label: "My profile (asks to sign in)" },
  { href: "/about", label: "About us" },
  { href: "/support", label: "Customer support" },
]

// stored href -> picker state; anything the pickers cannot represent opens as
// the advanced raw field instead of blocking the save
function inferDest(href) {
  const h = (href || "").trim()
  if (!h) return { type: "page", value: "", raw: "" }
  const prod = h.match(/^\/products\/([0-9a-f-]{36})$/i)
  if (prod) return { type: "product", value: prod[1], raw: "" }
  let m = h.match(/^\/menu\?category=(.+)$/)
  if (m) return { type: "category", value: decodeURIComponent(m[1]), raw: "" }
  m = h.match(/^\/menu\?brand=(.+)$/)
  if (m) return { type: "brand", value: decodeURIComponent(m[1]), raw: "" }
  m = h.match(/^\/menu\?promo=(.+)$/)
  if (m) return { type: "promo", value: decodeURIComponent(m[1]), raw: "" }
  if (SHOPPER_PAGES.some((p) => p.href === h)) return { type: "page", value: h, raw: "" }
  if (/^https?:\/\//.test(h)) return { type: "website", value: "", raw: h }
  return { type: "custom", value: "", raw: h }
}

const REQUIRED_PICK_MSG = {
  page: "Choose a page, or pick another link type",
  category: "Choose a category, or pick another link type",
  brand: "Choose a brand, or pick another link type",
  promo: "Choose a promotion, or pick another link type",
  product: "Pick a product, or pick another link type",
}

function LinkDialog({ section, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(() => {
    const d = inferDest(initial?.href)
    return {
      label: initial?.label || "",
      is_visible: initial?.is_visible ?? true,
      image_url: initial?.image_url || "",
      alt_text: initial?.alt_text || "",
      destType: d.type,
      destValue: d.value,
      raw: d.raw,
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const isSocial = section === "footer_social"
  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  // real data for the pickers, loaded once when the dialog opens;
  // every source fails independently - a stale dropdown beats a broken dialog
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [promos, setPromos] = useState([])
  const [policyPages, setPolicyPages] = useState([])

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const cats = await apiGet("/products/categories")
        if (!cancelled) setCategories(cats.items || [])
      } catch { /* dropdown shows the current value only */ }
      try {
        const br = await apiGet("/products/brands")
        if (!cancelled) setBrands(br.items || [])
      } catch { /* same */ }
      try {
        const token = await sessionToken()
        const pr = await apiGetAuth("/admin/promos", token)
        if (!cancelled) setPromos(pr.items || [])
      } catch { /* same */ }
      try {
        const content = await fetchSiteContent()
        const rows = contentPolicies(content)
        if (!cancelled) setPolicyPages((rows || []).map((p) => ({ href: `/policies/${p.slug}`, label: p.title || p.slug })))
      } catch { /* page dropdown simply lacks the policy pages */ }
    }
    load()
    return () => { cancelled = true }
  }, [sessionToken])

  // a saved /policies/... link shows as "A page on this site" once the
  // policy pages have loaded (they are not in the static list above)
  useEffect(() => {
    if (form.destType !== "custom") return
    const known = [...SHOPPER_PAGES, ...policyPages].find((p) => p.href === form.raw.trim())
    if (!known) return
    setForm((f) => (f.destType === "custom" && f.raw.trim() === known.href
      ? { ...f, destType: "page", destValue: known.href, raw: "" }
      : f))
  }, [form.destType, form.raw, policyPages])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const pick = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const changeType = (e) => setForm((f) => ({ ...f, destType: e.target.value, destValue: "", raw: "" }))
  const pageOptions = [...SHOPPER_PAGES, ...policyPages]
  const promoMeta = (code) => {
    const p = promos.find((x) => x.code === code)
    if (!p) return code
    const off = p.type === "percent" ? `${p.value}% off` : p.type === "fixed" ? `₱${p.value} off` : "free shipping"
    return `${p.code} — ${off}`
  }

  // the plain href the table stores, composed from whatever the picker holds
  function composeHref() {
    const t = form.destType
    const v = form.destValue
    if (t === "page") return v
    if (t === "category") return v ? `/menu?category=${encodeURIComponent(v)}` : ""
    if (t === "brand") return v ? `/menu?brand=${encodeURIComponent(v)}` : ""
    if (t === "promo") return v ? `/menu?promo=${encodeURIComponent(v)}` : ""
    if (t === "product") return v ? `/products/${v}` : ""
    return form.raw.trim() // website | custom
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    const label = form.label.trim()
    const href = composeHref()
    if (!label) { setError("Label is required (it is the text shoppers see)"); return }
    if (!href) { setError(REQUIRED_PICK_MSG[form.destType] || "Choose where this link goes"); return }
    if (href.length > 500) { setError("The link is too long (500 characters at most)"); return }
    if (form.destType === "website" && !/^https?:\/\//.test(href)) {
      setError("Website links need to start with https://")
      return
    }
    if (form.destType === "custom" && (href.startsWith("//") || (!href.startsWith("/") && !/^https?:\/\//.test(href)))) {
      setError("Start the link with / (a page on this site) or https:// (an external site)")
      return
    }
    setSaving(true)
    try {
      const payload = { label, href, is_visible: form.is_visible }
      if (isSocial) {
        payload.image_url = form.image_url.trim() || null
        payload.alt_text = form.alt_text.trim()
      }
      await onSubmit(payload)
    } catch (err) {
      setError(err.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const selectCls = "mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={initial ? "Edit link" : "New link"}>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 w-full h-full cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-[#16283f] shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-slate-100 tracking-tight">{initial ? "Edit link" : "New link"}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Pick where this link goes from the list - no need to type addresses. The advanced option is only for special links.</p>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="nav-label" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Label <span className="text-red-500">*</span>
              </label>
              <input id="nav-label" type="text" required maxLength={60} value={form.label} onChange={set("label")} aria-required="true" placeholder="What shoppers see, e.g. About us"
                className={selectCls} />
            </div>
            <div>
              <label htmlFor="nav-dest" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Where should this link go? <span className="text-red-500">*</span>
              </label>
              <select id="nav-dest" value={form.destType} onChange={changeType} aria-required="true" className={selectCls}>
                {DEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {form.destType === "page" && (
              <div>
                <label htmlFor="nav-page" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which page?</label>
                <select id="nav-page" required value={form.destValue} onChange={pick("destValue")} aria-required="true" className={selectCls}>
                  <option value="">Choose a page…</option>
                  {pageOptions.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
                </select>
              </div>
            )}
            {form.destType === "category" && (
              <div>
                <label htmlFor="nav-category" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which category?</label>
                <select id="nav-category" required value={form.destValue} onChange={pick("destValue")} aria-required="true" className={selectCls}>
                  <option value="">Choose a category…</option>
                  {!categories.includes(form.destValue) && form.destValue && <option value={form.destValue}>{form.destValue} (saved)</option>}
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Shoppers will land on the shop page filtered to this category.</p>
              </div>
            )}
            {form.destType === "brand" && (
              <div>
                <label htmlFor="nav-brand" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which brand?</label>
                <select id="nav-brand" required value={form.destValue} onChange={pick("destValue")} aria-required="true" className={selectCls}>
                  <option value="">Choose a brand…</option>
                  {!brands.includes(form.destValue) && form.destValue && <option value={form.destValue}>{form.destValue} (saved)</option>}
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Shoppers will land on the shop page filtered to this brand.</p>
              </div>
            )}
            {form.destType === "promo" && (
              <div>
                <label htmlFor="nav-promo" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which promotion?</label>
                <select id="nav-promo" required value={form.destValue} onChange={pick("destValue")} aria-required="true" className={selectCls}>
                  <option value="">Choose a promotion…</option>
                  {!promos.some((p) => p.code === form.destValue) && form.destValue && <option value={form.destValue}>{promoMeta(form.destValue)} (saved)</option>}
                  {promos.map((p) => <option key={p.code} value={p.code}>{promoMeta(p.code)}{p.is_active ? "" : " (inactive)"}</option>)}
                </select>
              </div>
            )}
            {form.destType === "product" && (
              <ProductPicker
                selected={form.destValue ? [form.destValue] : []}
                max={1}
                onToggle={(id) => setForm((f) => ({ ...f, destValue: f.destValue === id ? "" : id }))}
              />
            )}
            {form.destType === "website" && (
              <div>
                <label htmlFor="nav-href" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                  Website address <span className="text-red-500">*</span>
                </label>
                <input id="nav-href" type="url" required maxLength={500} value={form.raw} onChange={pick("raw")} aria-required="true" placeholder="https://…"
                  className={selectCls} />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Opens in a new tab on the site.</p>
              </div>
            )}
            {form.destType === "custom" && (
              <div>
                <label htmlFor="nav-href" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                  Link (advanced) <span className="text-red-500">*</span>
                </label>
                <input id="nav-href" type="text" required maxLength={500} value={form.raw} onChange={pick("raw")} aria-required="true" placeholder="/menu?promo=SUMMER or https://…"
                  className={selectCls} />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Start with / (a page on this site) or https:// (an external site).</p>
              </div>
            )}
            {isSocial && (
              <>
                <ImagePicker label="Icon image (optional)" value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} />
                <div>
                  <label htmlFor="nav-alt" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Icon alt text</label>
                  <input id="nav-alt" type="text" maxLength={120} value={form.alt_text} onChange={set("alt_text")} placeholder="Describes the icon for screen readers"
                    className={selectCls} />
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
              <input type="checkbox" checked={form.is_visible} onChange={(e) => setForm((f) => ({ ...f, is_visible: e.target.checked }))} className="rounded border-gray-300" />
              Visible on the site
            </label>
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">Cancel</button>
            <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-60 min-h-[44px]`}>{saving ? "Saving..." : initial ? "Save changes" : "Create link"}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LinkCard({ item, index, total, onMove, onEdit, onArchive, busy, selected, onToggleSelect, dragHandleProps, dragging, dragOver }) {
  // long-press the card (not its buttons/inputs) to select it
  const longPress = useLongPress(() => onToggleSelect())
  const ring = selected || dragging
    ? "border-[#F28C28] ring-2 ring-[#F28C28]/70"
    : dragOver
      ? "border-[#F28C28] ring-2 ring-[#F28C28]/40"
      : "border-gray-200 dark:border-[#2c4a6f]"
  return (
    <div
      {...longPress}
      data-sort-index={index}
      className={`rounded-2xl border bg-white dark:bg-[#16283f] p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition ${ring} ${dragging ? "opacity-60" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <RowCheckBox checked={selected} onChange={onToggleSelect} label={`Select link ${item.label}`} />
          <StatusPill kind={item.is_visible ? "success" : "neutral"}>{item.is_visible ? "Visible" : "Hidden"}</StatusPill>
          <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{item.label}</span>
          <span className="text-xs text-gray-500 dark:text-slate-400">#{index + 1} of {total}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400 break-all">{item.href}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {dragHandleProps && <GripHandle handleProps={dragHandleProps} />}
        <button type="button" onClick={() => onMove(item, -1)} disabled={busy || index === 0} aria-label={`Move ${item.label} up`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↑</button>
        <button type="button" onClick={() => onMove(item, 1)} disabled={busy || index === total - 1} aria-label={`Move ${item.label} down`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↓</button>
        <button type="button" onClick={() => onEdit(item)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">Edit</button>
        <button type="button" onClick={() => onArchive(item)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50">Archive</button>
      </div>
    </div>
  )
}

function AdminNavigation() {
  const [tab, setTab] = useState("navbar")
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

  // category editor state: rows come from the merged GET, edits are local
  // until one batch save (a single request = a single step-up)
  const [catRows, setCatRows] = useState(null)
  const [catOriginal, setCatOriginal] = useState(null)
  const [catLoading, setCatLoading] = useState(false)
  const [catError, setCatError] = useState("")
  const [catSaving, setCatSaving] = useState(false)
  // adding a category now, before any product uses the name; removals ride
  // along with the next batch save so one save = one step-up
  const [catRemoved, setCatRemoved] = useState([])
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [catAddError, setCatAddError] = useState("")

  const isCats = tab === "categories"
  const activeTab = TABS.find((t) => t.key === tab)

  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  const sel = useSelection()
  // stable callbacks from useSelection - plain identifiers for the hooks below
  const pruneSelection = sel.prune
  const clearSelection = sel.clear

  const loadLinks = useCallback(async (section, showArchived) => {
    setLoading(true); setError("")
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/nav-items?section=${section}&archived=${showArchived}`, token)
      const rows = data.items || []
      setItems(rows)
      // drop ids that are no longer in this list (archived elsewhere, tab changed)
      pruneSelection(rows.map((r) => r.id))
    } catch (err) {
      setError(err.message || "Failed to load links")
    } finally { setLoading(false) }
  }, [sessionToken, pruneSelection])

  const loadCats = useCallback(async () => {
    setCatLoading(true); setCatError("")
    try {
      const token = await sessionToken()
      const data = await apiGetAuth("/admin/categories", token)
      const rows = data.items || []
      setCatRows(rows)
      setCatOriginal(JSON.stringify(rows))
      setCatRemoved([])
    } catch (err) {
      setCatError(err.message || "Failed to load categories")
    } finally { setCatLoading(false) }
  }, [sessionToken])

  useEffect(() => {
    if (isCats) {
      if (catRows === null) loadCats()
    } else {
      loadLinks(tab, archived)
    }
  }, [tab, archived, isCats, catRows, loadCats, loadLinks])

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t) }, [toast])

  // a different tab or view is a different list - never carry a selection
  // across it (also clears when entering the category editor, which is a
  // form, not an item list)
  useEffect(() => { clearSelection() }, [tab, archived, clearSelection])

  const catDirty = isCats && catRows !== null && catOriginal !== null
    && (JSON.stringify(catRows) !== catOriginal || catRemoved.length > 0)

  // archived rows belong to the restore list below, not to the reorder grid
  const visible = archived ? [] : items
  const archivedRows = items.filter((s) => s.archived_at)
  const listRows = archived ? archivedRows : visible

  const allSelected = listRows.length > 0 && listRows.every((s) => sel.isSelected(s.id))
  const someSelected = listRows.some((s) => sel.isSelected(s.id))
  const onToggleAll = () => {
    if (allSelected) sel.clear()
    else sel.selectAll(listRows.map((s) => s.id))
  }
  const singleSelected = sel.count === 1 ? listRows.find((s) => sel.isSelected(s.id)) : null

  async function handleSubmitLink(payload) {
    const token = await sessionToken()
    if (dialog?.mode === "edit") {
      await apiPatchAuth(`/admin/nav-items/${dialog.item.id}`, payload, token)
      setToast("Link saved")
    } else {
      await apiPostAuth("/admin/nav-items", { section: tab, ...payload }, token)
      setToast("Link created")
    }
    setDialog(null); await loadLinks(tab, archived)
  }

  async function moveLinkTo(from, to) {
    if (from === to || to < 0 || to >= visible.length) return
    const ids = visible.map((s) => s.id)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth("/admin/nav-items/reorder", { section: tab, ids }, token)
      await loadLinks(tab, archived)
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleMoveLink(item, dir) {
    const i = visible.findIndex((s) => s.id === item.id)
    if (i < 0) return
    return moveLinkTo(i, i + dir)
  }

  // drag-to-reorder over the current tab's live list (archived has no order)
  const drag = useReorderDrag((from, to) => { moveLinkTo(from, to) })

  async function bulkVisibility(isVisible) {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiPatchAuth(`/admin/nav-items/${id}`, { is_visible: isVisible }, token))
      sel.clear()
      setToast(bulkSummary(isVisible ? "Shown" : "Hidden", res, "link"))
      await loadLinks(tab, archived)
    } catch (err) { setToast(err.message || "Update failed") } finally { setBusy(false) }
  }

  async function bulkArchive() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiDeleteAuth(`/admin/nav-items/${id}`, token))
      setConfirm(null)
      sel.clear()
      setToast(bulkSummary("Archived", res, "link"))
      await loadLinks(tab, archived)
    } catch (err) { setConfirm(null); setToast(err.message || "Archive failed") } finally { setBusy(false) }
  }

  async function bulkRestore() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiPostAuth(`/admin/nav-items/${id}/restore`, {}, token))
      sel.clear()
      setToast(bulkSummary("Restored", res, "link"))
      await loadLinks(tab, archived)
    } catch (err) { setToast(err.message || "Restore failed") } finally { setBusy(false) }
  }

  async function handleArchive() {
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiDeleteAuth(`/admin/nav-items/${confirm.item.id}`, token)
      setConfirm(null); setToast("Link archived"); await loadLinks(tab, archived)
    } catch (err) { setConfirm(null); setToast(err.message) } finally { setBusy(false) }
  }

  async function handleRestore(item) {
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth(`/admin/nav-items/${item.id}/restore`, {}, token)
      setToast("Link restored"); await loadLinks(tab, archived)
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleRestoreDefaults() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await apiPostAuth("/admin/content/restore-defaults", { scope: tab }, token)
      setConfirmRestore(false)
      setToast(`Restored ${res.restored} default link${res.restored === 1 ? "" : "s"} (${res.archived} previous archived)`)
      await loadLinks(tab, archived)
    } catch (err) { setConfirmRestore(false); setToast(err.message) } finally { setBusy(false) }
  }

  function moveCat(index, dir) {
    setCatRows((rows) => {
      const next = [...rows]
      const j = index + dir
      if (j < 0 || j >= next.length) return rows
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  function editCat(index, patch) {
    setCatRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function handleAddCat(e) {
    e.preventDefault()
    const name = newCatName.trim()
    setCatAddError("")
    if (!name) { setCatAddError("Type a category name first"); return }
    if (name.length > 120) { setCatAddError("Keep the name to 120 characters or fewer"); return }
    if ((catRows || []).some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setCatAddError(`"${name}" is already in the list`)
      return
    }
    setCatRows((rows) => [...rows, { name, label: null, sort_order: rows.length, is_visible: true, has_override: false, in_catalog: false }])
    setNewCatName("")
    setAddingCat(false)
    setToast("Category added - press Save changes to keep it")
  }

  function removeCat(index) {
    const r = catRows?.[index]
    if (!r) return
    // only names that already exist in site_categories need a server delete;
    // a row added-but-not-saved just disappears from the list
    if (r.has_override) setCatRemoved((prev) => (prev.includes(r.name) ? prev : [...prev, r.name]))
    setCatRows((rows) => rows.filter((_, j) => j !== index))
  }

  async function saveCats() {
    setCatSaving(true); setCatError("")
    try {
      const token = await sessionToken()
      const items = catRows.map((r, i) => ({
        name: r.name,
        label: r.label && r.label !== r.name ? r.label : null,
        sort_order: i,
        is_visible: r.is_visible !== false,
      }))
      const payload = { items, ...(catRemoved.length ? { removed: [...catRemoved] } : {}) }
      await apiPostAuth("/admin/categories", payload, token)
      setToast(catRemoved.length ? "Categories saved (removed)" : "Categories saved")
      await loadCats()
    } catch (err) {
      setCatError(err.message || "Save failed")
    } finally { setCatSaving(false) }
  }

  return (
    <AdminPage title="Navigation & Categories" subtitle="Menu links, footer links and the category filter list on the Menu page. Changes are live on the next visit - no rebuild needed.">
      <div role="tablist" aria-label="Navigation sections" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition border ${tab === t.key
              ? "bg-[#0b2e59] text-white border-[#0b2e59] dark:bg-blue-600 dark:border-blue-600"
              : "bg-white dark:bg-[#16283f] text-gray-600 dark:text-slate-300 border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab?.hint && <p className="mb-4 text-xs text-gray-500 dark:text-slate-400">{activeTab.hint}</p>}

      {toast && <div role="status" className="mb-4 rounded-lg border border-[#F28C28]/40 bg-[#F28C28]/10 px-4 py-2 text-sm font-semibold text-[#a35b0c] dark:text-[#F9B671]">{toast}</div>}

      {isCats ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              {catRows
                ? `${catRows.length} categories${catRows.some((r) => r.in_catalog === false) ? ` (${catRows.filter((r) => r.in_catalog === false).length} waiting for a product)` : ""}`
                : "Loading categories..."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => window.open("/?scPreview=1", "_blank")} className={btnGhost}>Preview storefront</button>
              <button type="button" onClick={() => setHistory(true)} className={btnGhost}>History</button>
              <button type="button" onClick={() => { setAddingCat(true); setCatAddError("") }} className={btnGhost}>+ Add category</button>
              {catDirty && (
                <button type="button" disabled={catSaving} onClick={() => { setCatRows(JSON.parse(catOriginal)); setCatRemoved([]); setCatError(""); setAddingCat(false); setNewCatName(""); setCatAddError("") }} className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-60">
                  Discard changes
                </button>
              )}
              <button type="button" disabled={!catDirty || catSaving} onClick={saveCats} className={`${btnPrimary} disabled:opacity-50`}>
                {catSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
          {addingCat && (
            <form onSubmit={handleAddCat} className="mb-4 rounded-2xl border border-[#F28C28]/40 bg-[#F28C28]/5 p-3 flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="cat-new" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">New category name</label>
                <input
                  id="cat-new"
                  type="text"
                  maxLength={120}
                  value={newCatName}
                  onChange={(e) => { setNewCatName(e.target.value); setCatAddError("") }}
                  onKeyDown={(e) => { if (e.key === "Escape") { setAddingCat(false); setCatAddError("") } }}
                  placeholder="e.g. Birds"
                  autoFocus
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">It appears on the Menu filter as soon as a product uses this name.</p>
                {catAddError && <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">{catAddError}</p>}
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={!newCatName.trim()} className={`${btnPrimary} disabled:opacity-50`}>Add</button>
                <button type="button" onClick={() => { setAddingCat(false); setCatAddError("") }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">Cancel</button>
              </div>
            </form>
          )}
          {catError && (
            <div role="alert" className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{catError}</p>
            </div>
          )}
          {catLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] h-14 animate-pulse" />)}
            </div>
          ) : !catRows ? null : catRows.length === 0 ? (
            catError ? null : (
              <EmptyState title="No categories found" message="Categories appear here once your products have category names - or add one now and assign products to it later." />
            )
          ) : (
            <div className="space-y-2">
              {catRows.map((r, i) => (
                <div key={r.name} className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => moveCat(i, -1)} disabled={i === 0} aria-label={`Move ${r.name} up`} className="px-2 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↑</button>
                    <button type="button" onClick={() => moveCat(i, 1)} disabled={i === catRows.length - 1} aria-label={`Move ${r.name} down`} className="px-2 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↓</button>
                    <span className="ml-1 text-xs font-bold text-gray-700 dark:text-slate-200">{r.name}</span>
                    {r.in_catalog === false && <StatusPill kind="info">No products yet</StatusPill>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="sr-only" htmlFor={`cat-label-${i}`}>Display name for {r.name}</label>
                    <input
                      id={`cat-label-${i}`}
                      type="text"
                      maxLength={60}
                      value={r.label || ""}
                      placeholder={`Display name (shows as "${r.name}")`}
                      onChange={(e) => editCat(i, { label: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] px-2 py-1.5 text-sm text-gray-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={r.is_visible !== false}
                        onChange={(e) => editCat(i, { is_visible: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      In filter list
                    </label>
                    {r.in_catalog === false && (
                      <button type="button" onClick={() => removeCat(i)} aria-label={`Remove ${r.name} from this list`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-gray-300" />
              Show archived
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => window.open("/?scPreview=1", "_blank")} className={btnGhost}>Preview storefront</button>
              <button type="button" onClick={() => setHistory(true)} className={btnGhost}>History</button>
              <button type="button" onClick={() => setConfirmRestore(true)} disabled={busy} className={`${btnGhost} border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300 disabled:opacity-50`}>
                Restore default links
              </button>
              <button type="button" onClick={() => setDialog({ mode: "create" })} className={`${btnPrimary} whitespace-nowrap`}>New link</button>
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
              <button type="button" onClick={() => loadLinks(tab, archived)} className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300 underline">Retry</button>
            </div>
          )}

          {!loading && items.length > 0 && (
            <>
              <SelectAllRow allSelected={allSelected} someSelected={someSelected} onToggle={onToggleAll} total={listRows.length} noun="link" />
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
                    <button type="button" onClick={() => bulkVisibility(false)} disabled={busy} className={`${barBtnPlain} min-h-[36px]`}>
                      Hide {sel.count}
                    </button>
                    <button type="button" onClick={() => bulkVisibility(true)} disabled={busy} className={`${barBtnAccent} min-h-[36px]`}>
                      Show {sel.count}
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
                title={archived ? "No archived links" : "No links in this section yet"}
                message={archived ? "Archived links can be restored." : "Create the first link - it is visible on the site as soon as you make it."}
              />
            )
          ) : (
            <div className="space-y-3">
              {visible.map((s, i) => (
                <LinkCard
                  key={s.id}
                  item={s}
                  index={i}
                  total={visible.length}
                  busy={busy}
                  selected={sel.isSelected(s.id)}
                  onToggleSelect={() => sel.toggle(s.id)}
                  dragHandleProps={drag.handleProps(i)}
                  dragging={drag.isDragging(i)}
                  dragOver={drag.isOver(i)}
                  onMove={handleMoveLink}
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
                    <RowCheckBox checked={sel.isSelected(s.id)} onChange={() => sel.toggle(s.id)} label={`Select link ${s.label}`} />
                    <span className="text-xs text-gray-500 dark:text-slate-400 truncate">{s.label}</span>
                  </label>
                  <button type="button" onClick={() => handleRestore(s)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-50">Restore</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {dialog && (
        <LinkDialog
          section={tab}
          initial={dialog.item}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmitLink}
        />
      )}
      {confirm && (
        <ConfirmDialog
          open
          danger
          busy={busy}
          title={confirm.mode === "bulk" ? `Archive ${sel.count} links?` : "Archive link?"}
          message="The link disappears from the site immediately. You can restore it from the archived view."
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
          title="Restore default links?"
          message={`Archives every current link in "${activeTab?.label}" and puts the built-in defaults back. Your links stay restorable from Show archived.`}
          confirmLabel="Restore defaults"
          onConfirm={handleRestoreDefaults}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
      {history && (
        <ContentHistoryDialog
          entity={isCats ? "categories" : "nav_items"}
          onClose={() => setHistory(false)}
        />
      )}
    </AdminPage>
  )
}

export default AdminNavigation
