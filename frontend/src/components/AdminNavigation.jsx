import React, { useCallback, useEffect, useState } from "react"
import supabase from "../lib/supabase"
import { apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from "../lib/api.js"
import { AdminPage, StatusPill, EmptyState, btnPrimary, ConfirmDialog } from "./adminTheme.jsx"
import ImagePicker from "./ImagePicker.jsx"

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

function LinkDialog({ section, initial, onClose, onSubmit }) {
  const [form, setForm] = useState({
    label: initial?.label || "",
    href: initial?.href || "",
    is_visible: initial?.is_visible ?? true,
    image_url: initial?.image_url || "",
    alt_text: initial?.alt_text || "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const isSocial = section === "footer_social"

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    const label = form.label.trim()
    const href = form.href.trim()
    if (!label) { setError("Label is required (it is the text shoppers see)"); return }
    if (href.startsWith("//") || (!href.startsWith("/") && !/^https?:\/\//.test(href))) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={initial ? "Edit link" : "New link"}>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 w-full h-full cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-[#16283f] shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-slate-100 tracking-tight">{initial ? "Edit link" : "New link"}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Links starting with / stay inside the site (for example /menu or /about); https:// links open an external site in a new tab.</p>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="nav-label" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Label <span className="text-red-500">*</span>
              </label>
              <input id="nav-label" type="text" required maxLength={60} value={form.label} onChange={set("label")} aria-required="true" placeholder="What shoppers see, e.g. About us"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="nav-href" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Link <span className="text-red-500">*</span>
              </label>
              <input id="nav-href" type="text" required maxLength={500} value={form.href} onChange={set("href")} aria-required="true" placeholder="/about or https://…"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            {isSocial && (
              <>
                <ImagePicker label="Icon image (optional)" value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} />
                <div>
                  <label htmlFor="nav-alt" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Icon alt text</label>
                  <input id="nav-alt" type="text" maxLength={120} value={form.alt_text} onChange={set("alt_text")} placeholder="Describes the icon for screen readers"
                    className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
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
            <button type="submit" disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>{saving ? "Saving..." : initial ? "Save changes" : "Create link"}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LinkCard({ item, index, total, onMove, onEdit, onArchive, busy }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind={item.is_visible ? "success" : "neutral"}>{item.is_visible ? "Visible" : "Hidden"}</StatusPill>
          <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{item.label}</span>
          <span className="text-xs text-gray-500 dark:text-slate-400">#{index + 1} of {total}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400 break-all">{item.href}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 shrink-0">
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
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState("")

  // category editor state: rows come from the merged GET, edits are local
  // until one batch save (a single request = a single step-up)
  const [catRows, setCatRows] = useState(null)
  const [catOriginal, setCatOriginal] = useState(null)
  const [catLoading, setCatLoading] = useState(false)
  const [catError, setCatError] = useState("")
  const [catSaving, setCatSaving] = useState(false)

  const isCats = tab === "categories"
  const activeTab = TABS.find((t) => t.key === tab)

  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  const loadLinks = useCallback(async (section, showArchived) => {
    setLoading(true); setError("")
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/nav-items?section=${section}&archived=${showArchived}`, token)
      setItems(data.items || [])
    } catch (err) {
      setError(err.message || "Failed to load links")
    } finally { setLoading(false) }
  }, [sessionToken])

  const loadCats = useCallback(async () => {
    setCatLoading(true); setCatError("")
    try {
      const token = await sessionToken()
      const data = await apiGetAuth("/admin/categories", token)
      const rows = data.items || []
      setCatRows(rows)
      setCatOriginal(JSON.stringify(rows))
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

  const catDirty = isCats && catRows !== null && catOriginal !== null && JSON.stringify(catRows) !== catOriginal

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

  async function handleMoveLink(item, dir) {
    const ids = items.map((s) => s.id)
    const i = ids.indexOf(item.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ids.splice(j, 0, ids.splice(i, 1)[0])
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth("/admin/nav-items/reorder", { section: tab, ids }, token)
      await loadLinks(tab, archived)
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
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
      await apiPostAuth("/admin/categories", { items }, token)
      setToast("Categories saved")
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
              {catRows ? `${catRows.length} categories from your active products` : "Loading categories..."}
            </p>
            <div className="flex gap-2">
              {catDirty && (
                <button type="button" disabled={catSaving} onClick={() => { setCatRows(JSON.parse(catOriginal)); setCatError("") }} className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-60">
                  Discard changes
                </button>
              )}
              <button type="button" disabled={!catDirty || catSaving} onClick={saveCats} className={`${btnPrimary} disabled:opacity-50`}>
                {catSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
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
              <EmptyState title="No categories found" message="Categories appear here once your products have category names." />
            )
          ) : (
            <div className="space-y-2">
              {catRows.map((r, i) => (
                <div key={r.name} className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => moveCat(i, -1)} disabled={i === 0} aria-label={`Move ${r.name} up`} className="px-2 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↑</button>
                    <button type="button" onClick={() => moveCat(i, 1)} disabled={i === catRows.length - 1} aria-label={`Move ${r.name} down`} className="px-2 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↓</button>
                    <span className="ml-1 text-xs font-bold text-gray-700 dark:text-slate-200">{r.name}</span>
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
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300 shrink-0">
                    <input
                      type="checkbox"
                      checked={r.is_visible !== false}
                      onChange={(e) => editCat(i, { is_visible: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    In filter list
                  </label>
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
            <button type="button" onClick={() => setDialog({ mode: "create" })} className={`${btnPrimary} whitespace-nowrap`}>New link</button>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
              <button type="button" onClick={() => loadLinks(tab, archived)} className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300 underline">Retry</button>
            </div>
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
              {items.map((s, i) => (
                <LinkCard key={s.id} item={s} index={i} total={items.length} busy={busy} onMove={handleMoveLink} onEdit={(item) => setDialog({ mode: "edit", item })} onArchive={(item) => setConfirm({ item })} />
              ))}
            </div>
          )}

          {archived && items.length > 0 && (
            <div className="mt-4 space-y-2">
              {items.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-dashed border-gray-300 dark:border-[#2c4a6f] px-4 py-2">
                  <span className="text-xs text-gray-500 dark:text-slate-400">{s.label}</span>
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
          title="Archive link?"
          message="The link disappears from the site immediately. You can restore it from the archived view."
          confirmLabel="Archive"
          onConfirm={handleArchive}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  )
}

export default AdminNavigation
