import React, { useCallback, useEffect, useMemo, useState } from "react"
import supabase from "../lib/supabase"
import { apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from "../lib/api.js"
import { AdminPage, StatusPill, EmptyState, btnPrimary, ConfirmDialog } from "./adminTheme.jsx"

const PLACEMENTS = [
  { id: "home_hero", label: "Hero carousel", hint: "Big slides at the top of the home page." },
  { id: "brand_strip", label: "Brand strip", hint: "Row of brand tiles under the hero." },
  { id: "category_top", label: "Category top", hint: "Banner above a product row." },
  { id: "promo_strip", label: "Promo strip", hint: "Thin promo banner under the header." },
  { id: "announcement_bar", label: "Announcement bar", hint: "Short text bar at the very top." },
]

const LINK_TYPE_OPTIONS = [
  { value: "none", label: "No link" },
  { value: "product", label: "Product page" },
  { value: "category", label: "Category (menu)" },
  { value: "promo", label: "Promotion" },
  { value: "url", label: "Website URL" },
]

function statusOf(b) {
  if (b.status === "draft") return { kind: "neutral", label: "Draft" }
  if (b.status === "scheduled") return { kind: "info", label: "Scheduled" }
  return { kind: "success", label: "Published" }
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

function BannerDialog({ title, placement, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
    desktop_image_url: initial?.desktop_image_url || "",
    mobile_image_url: initial?.mobile_image_url || "",
    alt: initial?.alt || "",
    title_: initial?.title || "",
    subtitle: initial?.subtitle || "",
    button_text: initial?.button_text || "",
    link_type: initial?.link_type || "none",
    link_target: initial?.link_target || "",
    status: initial?.status || "draft",
    starts_at: toLocalInput(initial?.starts_at),
    ends_at: toLocalInput(initial?.ends_at),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const linkHint = {
    product: "e.g. /products/<id>",
    category: "e.g. /menu?category=Dogs",
    promo: "e.g. /menu?promo=SUMMER10",
    url: "https://…",
  }[form.link_type]

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      const payload = {
        desktop_image_url: form.desktop_image_url.trim(),
        mobile_image_url: form.mobile_image_url.trim() || null,
        alt: form.alt.trim(),
        title: form.title_ || null,
        subtitle: form.subtitle || null,
        button_text: form.button_text || null,
        link_type: form.link_type,
        link_target: form.link_type === "none" ? null : form.link_target.trim(),
        status: form.status,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      }
      if (!initial) payload.placement = placement
      await onSubmit(payload)
    } catch (err) {
      setError(err.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 w-full h-full cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[#16283f] shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-slate-100 tracking-tight">{title}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="b-desktop" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Desktop image <span className="text-red-500">*</span>
              </label>
              <input id="b-desktop" type="text" required value={form.desktop_image_url} onChange={set("desktop_image_url")}
                placeholder="/banner.png or https://…" aria-required="true"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Upload in the Media Library, then paste its URL. Hero slides work best at 1600×600.</p>
              {form.desktop_image_url.trim() && (
                <img src={form.desktop_image_url.trim()} alt="Preview of the banner image" className="mt-2 rounded-lg max-h-28 object-cover w-full" onError={(e) => { e.currentTarget.style.display = "none" }} />
              )}
            </div>
            <div>
              <label htmlFor="b-mobile" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Mobile image (optional)</label>
              <input id="b-mobile" type="text" value={form.mobile_image_url} onChange={set("mobile_image_url")} placeholder="/banner-mobile.png"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="b-alt" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                Alt text <span className="text-red-500">*</span>
              </label>
              <input id="b-alt" type="text" required maxLength={200} value={form.alt} onChange={set("alt")} aria-required="true"
                placeholder="Describe the image"
                className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="b-title" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Title (optional)</label>
              <input id="b-title" type="text" maxLength={120} value={form.title_} onChange={set("title_")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="b-subtitle" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Subtitle (optional)</label>
              <input id="b-subtitle" type="text" maxLength={200} value={form.subtitle} onChange={set("subtitle")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="b-button" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Button text (optional)</label>
              <input id="b-button" type="text" maxLength={40} value={form.button_text} onChange={set("button_text")} placeholder="Shop now" className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="b-linktype" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Link to</label>
              <select id="b-linktype" value={form.link_type} onChange={set("link_type")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100">
                {LINK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {form.link_type !== "none" && (
              <div>
                <label htmlFor="b-target" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Link target</label>
                <input id="b-target" type="text" required value={form.link_target} onChange={set("link_target")} placeholder={linkHint} aria-required="true"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
              </div>
            )}
            <div>
              <label htmlFor="b-status" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Status</label>
              <select id="b-status" value={form.status} onChange={set("status")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100">
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published (live)</option>
                <option value="scheduled">Scheduled (needs start date)</option>
              </select>
            </div>
            <div>
              <label htmlFor="b-starts" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Starts at</label>
              <input id="b-starts" type="datetime-local" value={form.starts_at} onChange={set("starts_at")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="b-ends" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Ends at</label>
              <input id="b-ends" type="datetime-local" value={form.ends_at} onChange={set("ends_at")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100" />
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

function BannerCard({ banner, index, total, onMove, onEdit, onArchive, busy }) {
  const [imgFailed, setImgFailed] = useState(false)
  const ctr = banner.impressions > 0 ? `${Math.round((banner.clicks / banner.impressions) * 100)}%` : "—"
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] overflow-hidden flex flex-col sm:flex-row">
      <div className="relative sm:w-48 shrink-0 aspect-video sm:aspect-auto bg-gray-100 dark:bg-[#0f2036]">
        {imgFailed ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-red-500 dark:text-red-400">Failed to load</div>
        ) : (
          <img src={banner.desktop_image_url} alt={banner.alt} loading="lazy" onError={() => setImgFailed(true)} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind={statusOf(banner).kind}>{statusOf(banner).label}</StatusPill>
          {banner.title && <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{banner.title}</span>}
          <span className="text-xs text-gray-500 dark:text-slate-400">#{index + 1} of {total}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2" title={banner.alt}>{banner.alt}</p>
        {(banner.starts_at || banner.ends_at) && (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {fmtDate(banner.starts_at) || "now"} → {fmtDate(banner.ends_at) || "no end"}
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Views {banner.impressions ?? 0} · Clicks {banner.clicks ?? 0} · CTR {ctr}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <button type="button" onClick={() => onMove(banner, -1)} disabled={busy || index === 0} aria-label={`Move ${banner.alt} up`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↑</button>
          <button type="button" onClick={() => onMove(banner, 1)} disabled={busy || index === total - 1} aria-label={`Move ${banner.alt} down`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-40">↓</button>
          <button type="button" onClick={() => onEdit(banner)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition">Edit</button>
          <button type="button" onClick={() => onArchive(banner)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50">Archive</button>
        </div>
      </div>
    </div>
  )
}

function AdminBanners() {
  const [placement, setPlacement] = useState("home_hero")
  const [items, setItems] = useState([])
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState("")

  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/banners?placement=${placement}&archived=${archived}`, token)
      setItems(data.items || [])
    } catch (err) {
      setError(err.message || "Failed to load banners")
    } finally { setLoading(false) }
  }, [placement, archived, sessionToken])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t) }, [toast])

  const visible = useMemo(() => (archived ? [] : items), [items, archived])
  const placementMeta = PLACEMENTS.find((p) => p.id === placement)

  async function handleSubmitBanner(payload) {
    const token = await sessionToken()
    if (dialog?.mode === "edit") {
      await apiPatchAuth(`/admin/banners/${dialog.item.id}`, payload, token)
      setToast("Banner saved")
    } else {
      await apiPostAuth("/admin/banners", payload, token)
      setToast("Banner created as draft" + (payload.status !== "draft" ? ` (${payload.status})` : ""))
    }
    setDialog(null); await load()
  }

  async function handleMove(banner, dir) {
    const ids = visible.map((b) => b.id)
    const i = ids.indexOf(banner.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ids.splice(j, 0, ids.splice(i, 1)[0])
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth("/admin/banners/reorder", { placement, ids }, token)
      await load()
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleArchive() {
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiDeleteAuth(`/admin/banners/${confirm.item.id}`, token)
      setConfirm(null); setToast("Banner archived"); await load()
    } catch (err) { setConfirm(null); setToast(err.message) } finally { setBusy(false) }
  }

  async function handleRestore(banner) {
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth(`/admin/banners/${banner.id}/restore`, {}, token)
      setToast("Banner restored"); await load()
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  return (
    <AdminPage title="Banners & Carousel" subtitle="Slides, strips and bars across the storefront. New banners start as drafts.">
      <div className="mb-4 flex flex-col gap-3">
        <div role="tablist" aria-label="Banner placements" className="flex flex-wrap gap-1.5">
          {PLACEMENTS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={placement === p.id}
              type="button"
              onClick={() => setPlacement(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition ${placement === p.id ? "bg-[#F28C28] text-white" : "text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f]"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-slate-400">{placementMeta?.hint}</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-gray-300" />
              Show archived
            </label>
            <button type="button" onClick={() => setDialog({ mode: "create" })} className={`${btnPrimary} whitespace-nowrap`}>New banner</button>
          </div>
        </div>
      </div>

      {toast && <div role="status" className="mb-4 rounded-lg border border-[#F28C28]/40 bg-[#F28C28]/10 px-4 py-2 text-sm font-semibold text-[#a35b0c] dark:text-[#F9B671]">{toast}</div>}
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
          <button type="button" onClick={load} className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300 underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-[#2c4a6f] bg-white dark:bg-[#16283f] h-28 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        error ? null : (
          <EmptyState
            title={archived ? "No archived banners" : "No banners here yet"}
            message={archived ? "Archived banners can be restored." : "Create the first banner for this spot. It stays a draft until you publish it."}
          />
        )
      ) : (
        <div className="space-y-3">
          {visible.map((b, i) => (
            <BannerCard
              key={b.id}
              banner={b}
              index={i}
              total={visible.length}
              busy={busy}
              onMove={handleMove}
              onEdit={(item) => setDialog({ mode: "edit", item })}
              onArchive={(item) => setConfirm({ item })}
            />
          ))}
        </div>
      )}

      {archived && items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.filter((b) => b.archived_at).map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-xl border border-dashed border-gray-300 dark:border-[#2c4a6f] px-4 py-2">
              <span className="text-xs text-gray-500 dark:text-slate-400">{b.alt}</span>
              <button type="button" onClick={() => handleRestore(b)} disabled={busy} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition disabled:opacity-50">Restore</button>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <BannerDialog
          title={dialog.mode === "edit" ? "Edit banner" : `New ${placementMeta?.label.toLowerCase()} banner`}
          placement={placement}
          initial={dialog.item}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmitBanner}
        />
      )}
      {confirm && (
        <ConfirmDialog
          open
          danger
          busy={busy}
          title="Archive banner?"
          message="It disappears from the storefront immediately. You can restore it from the archived view."
          confirmLabel="Archive"
          onConfirm={handleArchive}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  )
}

export default AdminBanners
