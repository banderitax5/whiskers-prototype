import React, { useCallback, useEffect, useMemo, useState } from "react"
import supabase from "../lib/supabase"
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from "../lib/api.js"
import { AdminPage, StatusPill, EmptyState, btnPrimary, btnGhost, ConfirmDialog } from "./adminTheme.jsx"
import ImagePicker from "./ImagePicker.jsx"
import ProductPicker from "./ProductPicker.jsx"
import ContentHistoryDialog from "./ContentHistoryDialog.jsx"
import {
  useSelection, useLongPress, useReorderDrag, RowCheckBox, SelectionBar, SelectAllRow,
  GripHandle, bulkApply, bulkSummary, barBtnAccent, barBtnDanger, barBtnPlain,
} from "./adminBulk.jsx"

const PLACEMENTS = [
  { id: "home_hero", label: "Hero carousel", hint: "Big slides at the top of the home page." },
  { id: "brand_strip", label: "Brand strip", hint: "Row of brand tiles under the hero." },
  { id: "category_top", label: "Category top", hint: "Banner above a product row." },
  { id: "promo_strip", label: "Promo strip", hint: "Thin promo banner under the header." },
  { id: "announcement_bar", label: "Announcement bar", hint: "Short text bar at the very top." },
]

const LINK_TYPE_OPTIONS = [
  { value: "none", label: "No link" },
  { value: "product", label: "A product" },
  { value: "category", label: "A category" },
  { value: "brand", label: "A brand" },
  { value: "promo", label: "A promotion" },
  { value: "url", label: "A web page" },
]

// pages shoppers already know - picked from a list instead of typed
const INTERNAL_PAGES = [
  { href: "/", label: "Home page" },
  { href: "/menu", label: "Shop all products" },
  { href: "/pets", label: "Pet recommendation" },
  { href: "/about", label: "About us" },
  { href: "/cart", label: "Shopping cart" },
  { href: "/support", label: "Customer support" },
]

// stored link_target <-> picker value, so legacy rows (even odd ones from the
// old seed) open in the right control or are clearly marked unreadable
function targetToPicker(linkType, target) {
  if (!target) return ""
  if (linkType === "product") {
    const m = String(target).match(/\/products\/([0-9a-f-]{36})/i)
    return m ? m[1] : ""
  }
  if (linkType === "category") {
    const m = String(target).match(/^\/menu\?category=(.+)$/)
    if (m) return decodeURIComponent(m[1])
    return ""
  }
  if (linkType === "promo") {
    const m = String(target).match(/^\/menu\?promo=(.+)$/)
    return m ? decodeURIComponent(m[1]) : ""
  }
  if (linkType === "brand") {
    // stored as /menu?brand=Name; the legacy seed stored the bare name,
    // which is still perfectly readable for this link type
    const m = String(target).match(/^\/menu\?brand=(.+)$/)
    return m ? decodeURIComponent(m[1]) : String(target)
  }
  return String(target)
}

// a stored destination the pickers cannot represent (the old seed wrote bare
// brand names as category links) would make every save fail server-side; the
// dialog opens those rows with the link turned off and a clear note instead
function hasUnreadableLink(banner) {
  const t = banner?.link_type || "none"
  const target = banner?.link_target || ""
  return t !== "none" && t !== "url" && Boolean(target) && !targetToPicker(t, target)
}

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
  // computed before the first render so an unreadable legacy destination is
  // turned off once, with a note, instead of blocking every save with a 400
  const linkWasCleared = hasUnreadableLink(initial)
  const [form, setForm] = useState(() => ({
    desktop_image_url: initial?.desktop_image_url || "",
    mobile_image_url: initial?.mobile_image_url || "",
    alt: initial?.alt || "",
    title_: initial?.title || "",
    subtitle: initial?.subtitle || "",
    button_text: initial?.button_text || "",
    link_type: linkWasCleared ? "none" : initial?.link_type || "none",
    link_target: linkWasCleared ? "" : initial?.link_target || "",
    status: initial?.status || "draft",
    starts_at: toLocalInput(initial?.starts_at),
    ends_at: toLocalInput(initial?.ends_at),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // real data for the pickers, loaded once when the dialog opens
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [promos, setPromos] = useState([])
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const cats = await apiGet("/products/categories")
        if (!cancelled) setCategories(cats.items || [])
      } catch { /* picker falls back to "choose again" */ }
      try {
        const br = await apiGet("/products/brands")
        if (!cancelled) setBrands(br.items || [])
      } catch { /* brand dropdown shows the current value only */ }
      try {
        const token = await sessionToken()
        const pr = await apiGetAuth("/admin/promos", token)
        if (!cancelled) setPromos(pr.items || [])
      } catch { /* promo dropdown shows the current value only */ }
    }
    load()
    return () => { cancelled = true }
  }, [sessionToken])

  const pickerValue = targetToPicker(form.link_type, form.link_target)
  const legacyTarget = form.link_type !== "none" && form.link_type !== "url" && !pickerValue
  const isCustomUrl = form.link_type === "url" && form.link_target && !INTERNAL_PAGES.some((p) => p.href === form.link_target)
  const promoMeta = (code) => {
    const p = promos.find((x) => x.code === code)
    if (!p) return code
    const off = p.type === "percent" ? `${p.value}% off` : p.type === "fixed" ? `₱${p.value} off` : "free shipping"
    return `${p.code} — ${off}`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    if (form.link_type !== "none" && !String(form.link_target || "").trim()) {
      setError("Choose where this banner should link, or switch back to “No link”.")
      return
    }
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
              <ImagePicker
                label="Desktop image"
                required
                value={form.desktop_image_url}
                onChange={(v) => setForm((f) => ({ ...f, desktop_image_url: v }))}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Pick an uploaded image, or upload new art in the Media Library. Hero slides work best at 1600×600.</p>
              {form.desktop_image_url.trim() && (
                <img src={form.desktop_image_url.trim()} alt="Preview of the banner image" className="mt-2 rounded-lg max-h-28 object-cover w-full" onError={(e) => { e.currentTarget.style.display = "none" }} />
              )}
            </div>
            <div className="sm:col-span-2">
              <ImagePicker
                label="Mobile image (optional)"
                value={form.mobile_image_url || ""}
                onChange={(v) => setForm((f) => ({ ...f, mobile_image_url: v }))}
              />
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
            <div className="sm:col-span-2">
              <label htmlFor="b-linktype" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Where should this banner link?</label>
              <select id="b-linktype" value={form.link_type} onChange={set("link_type")} className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100">
                {LINK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {linkWasCleared && (
                <p className="mt-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  The saved destination couldn’t be read, so the link was turned off — choose a new one (or save with “No link”).
                </p>
              )}
            </div>
            {form.link_type === "product" && (
              <div className="sm:col-span-2">
                {legacyTarget && (
                  <p className="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-400">The saved destination can’t be read — pick the product again.</p>
                )}
                <ProductPicker
                  selected={pickerValue ? [pickerValue] : []}
                  max={1}
                  onToggle={(id) => setForm((f) => ({ ...f, link_target: pickerValue === id ? "" : `/products/${id}` }))}
                />
              </div>
            )}
            {form.link_type === "category" && (
              <div className="sm:col-span-2">
                <label htmlFor="b-target-category" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which category?</label>
                <select
                  id="b-target-category"
                  required
                  value={pickerValue}
                  onChange={(e) => setForm((f) => ({ ...f, link_target: e.target.value ? `/menu?category=${encodeURIComponent(e.target.value)}` : "" }))}
                  aria-required="true"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="">Choose a category…</option>
                  {!categories.includes(pickerValue) && pickerValue && <option value={pickerValue}>{pickerValue} (saved)</option>}
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Shoppers will land on the shop page filtered to this category.</p>
              </div>
            )}
            {form.link_type === "brand" && (
              <div className="sm:col-span-2">
                <label htmlFor="b-target-brand" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which brand?</label>
                <select
                  id="b-target-brand"
                  required
                  value={pickerValue}
                  onChange={(e) => setForm((f) => ({ ...f, link_target: e.target.value ? `/menu?brand=${encodeURIComponent(e.target.value)}` : "" }))}
                  aria-required="true"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="">Choose a brand…</option>
                  {!brands.includes(pickerValue) && pickerValue && <option value={pickerValue}>{pickerValue} (saved)</option>}
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Shoppers will land on the shop page filtered to this brand.</p>
              </div>
            )}
            {form.link_type === "promo" && (
              <div className="sm:col-span-2">
                <label htmlFor="b-target-promo" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which promotion?</label>
                <select
                  id="b-target-promo"
                  required
                  value={pickerValue}
                  onChange={(e) => setForm((f) => ({ ...f, link_target: e.target.value ? `/menu?promo=${encodeURIComponent(e.target.value)}` : "" }))}
                  aria-required="true"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="">Choose a promotion…</option>
                  {!promos.some((p) => p.code === pickerValue) && pickerValue && <option value={pickerValue}>{promoMeta(pickerValue)} (saved)</option>}
                  {promos.map((p) => <option key={p.code} value={p.code}>{promoMeta(p.code)}{p.is_active ? "" : " (inactive)"}</option>)}
                </select>
              </div>
            )}
            {form.link_type === "url" && (
              <div className="sm:col-span-2">
                <label htmlFor="b-target-page" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">Which page?</label>
                <select
                  id="b-target-page"
                  required={!isCustomUrl}
                  value={isCustomUrl ? "__other" : form.link_target || ""}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => ({ ...f, link_target: v === "__other" ? "" : v }))
                  }}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="">Choose a page…</option>
                  {INTERNAL_PAGES.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
                  <option value="__other">Another website…</option>
                  {isCustomUrl && <option value="__other" hidden>{form.link_target}</option>}
                </select>
                {isCustomUrl && (
                  <input
                    type="url"
                    required
                    value={form.link_target}
                    onChange={(e) => setForm((f) => ({ ...f, link_target: e.target.value }))}
                    aria-label="Website address"
                    placeholder="https://…"
                    className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0f2036] p-2 text-sm text-gray-900 dark:text-slate-100"
                  />
                )}
              </div>
            )}
            {form.link_type !== "none" && legacyTarget && form.link_type !== "product" && (
              <p className="sm:col-span-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                The saved destination can’t be read — choose one again (or switch to “No link”).
              </p>
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

function BannerCard({ banner, index, total, onMove, onEdit, onArchive, busy, selected, onToggleSelect, dragHandleProps, dragging, dragOver }) {
  const [imgFailed, setImgFailed] = useState(false)
  // long-press the card (not its buttons/inputs) to select it
  const longPress = useLongPress(() => onToggleSelect())
  const ctr = banner.impressions > 0 ? `${Math.round((banner.clicks / banner.impressions) * 100)}%` : "—"
  const ring = selected || dragging
    ? "border-[#0b2e59] ring-2 ring-[#0b2e59]/50 dark:border-yellow-400 dark:ring-yellow-400/50"
    : dragOver
      ? "border-[#0b2e59] ring-2 ring-[#0b2e59]/25 dark:border-yellow-400 dark:ring-yellow-400/25"
      : "border-gray-200 dark:border-[#2c4a6f]"
  return (
    <div
      {...longPress}
      data-sort-index={index}
      className={`rounded-2xl border bg-white dark:bg-[#16283f] overflow-hidden flex flex-col sm:flex-row transition ${ring} ${dragging ? "opacity-60" : ""}`}
    >
      <div className="relative sm:w-48 shrink-0 aspect-video sm:aspect-auto bg-gray-100 dark:bg-[#0f2036]">
        {imgFailed ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-red-500 dark:text-red-400">Failed to load</div>
        ) : (
          <img src={banner.desktop_image_url} alt={banner.alt} loading="lazy" onError={() => setImgFailed(true)} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <RowCheckBox checked={selected} onChange={onToggleSelect} label={`Select banner ${banner.alt}`} />
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
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {dragHandleProps && <GripHandle handleProps={dragHandleProps} />}
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
      const data = await apiGetAuth(`/admin/banners?placement=${placement}&archived=${archived}`, token)
      const rows = data.items || []
      setItems(rows)
      // drop ids that are no longer in this list (archived elsewhere, tab changed)
      pruneSelection(rows.map((b) => b.id))
    } catch (err) {
      setError(err.message || "Failed to load banners")
    } finally { setLoading(false) }
  }, [placement, archived, sessionToken, pruneSelection])

  useEffect(() => { load() }, [load])
  // a different tab or view is a different list - never carry a selection across
  useEffect(() => { clearSelection() }, [placement, archived, clearSelection])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t) }, [toast])

  const visible = useMemo(() => (archived ? [] : items), [items, archived])
  const archivedRows = useMemo(() => items.filter((b) => b.archived_at), [items])
  // the rows the current view shows (and therefore what select-all covers)
  const listRows = archived ? archivedRows : visible
  const placementMeta = PLACEMENTS.find((p) => p.id === placement)

  const allSelected = listRows.length > 0 && listRows.every((b) => sel.isSelected(b.id))
  const someSelected = listRows.some((b) => sel.isSelected(b.id))
  const onToggleAll = () => {
    if (allSelected) sel.clear()
    else sel.selectAll(listRows.map((b) => b.id))
  }
  const singleSelected = sel.count === 1 ? listRows.find((b) => sel.isSelected(b.id)) : null

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

  async function moveBannerTo(from, to) {
    if (from === to || to < 0 || to >= visible.length) return
    const ids = visible.map((b) => b.id)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setBusy(true)
    try {
      const token = await sessionToken()
      await apiPostAuth("/admin/banners/reorder", { placement, ids }, token)
      await load()
    } catch (err) { setToast(err.message) } finally { setBusy(false) }
  }

  async function handleMove(banner, dir) {
    const i = visible.findIndex((b) => b.id === banner.id)
    if (i < 0) return
    return moveBannerTo(i, i + dir)
  }

  // drag-to-reorder over the current list (live view only - archived has no order)
  const drag = useReorderDrag((from, to) => { moveBannerTo(from, to) })

  async function bulkStatus(status, action) {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiPatchAuth(`/admin/banners/${id}`, { status }, token))
      sel.clear()
      setToast(bulkSummary(action, res, "banner"))
      await load()
    } catch (err) { setToast(err.message || "Update failed") } finally { setBusy(false) }
  }

  async function bulkArchive() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiDeleteAuth(`/admin/banners/${id}`, token))
      setConfirm(null)
      sel.clear()
      setToast(bulkSummary("Archived", res, "banner"))
      await load()
    } catch (err) { setConfirm(null); setToast(err.message || "Archive failed") } finally { setBusy(false) }
  }

  async function bulkRestore() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await bulkApply([...sel.selected], (id) => apiPostAuth(`/admin/banners/${id}/restore`, {}, token))
      sel.clear()
      setToast(bulkSummary("Restored", res, "banner"))
      await load()
    } catch (err) { setToast(err.message || "Restore failed") } finally { setBusy(false) }
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

  async function handleRestoreDefaults() {
    setBusy(true)
    try {
      const token = await sessionToken()
      const res = await apiPostAuth("/admin/content/restore-defaults", { scope: placement }, token)
      setConfirmRestore(false)
      setToast(`Restored ${res.restored} default slide${res.restored === 1 ? "" : "s"} (${res.archived} previous archived)`)
      await load()
    } catch (err) { setConfirmRestore(false); setToast(err.message) } finally { setBusy(false) }
  }

  // only the hero carousel and brand strip had built-in defaults at launch;
  // the other placements started empty, so "restore defaults" would just
  // archive the owner's rows with nothing to put back
  const hasDefaults = ["home_hero", "brand_strip"].includes(placement)

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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition ${placement === p.id ? "bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900" : "text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f]"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-slate-400">{placementMeta?.hint}</p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => window.open("/?scPreview=1", "_blank")} className={btnGhost}>Preview storefront</button>
            <button type="button" onClick={() => setHistory(true)} className={btnGhost}>History</button>
            {hasDefaults && (
              <button type="button" onClick={() => setConfirmRestore(true)} disabled={busy} className={`${btnGhost} border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300 disabled:opacity-50`}>
                Restore default slides
              </button>
            )}
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="rounded border-gray-300" />
              Show archived
            </label>
            <button type="button" onClick={() => setDialog({ mode: "create" })} className={`${btnPrimary} whitespace-nowrap`}>New banner</button>
          </div>
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
          <SelectAllRow allSelected={allSelected} someSelected={someSelected} onToggle={onToggleAll} total={listRows.length} noun="banner" />
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
              selected={sel.isSelected(b.id)}
              onToggleSelect={() => sel.toggle(b.id)}
              dragHandleProps={archived ? null : drag.handleProps(i)}
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
          {archivedRows.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 dark:border-[#2c4a6f] px-4 py-2">
              <label className="flex min-w-0 items-center gap-2 cursor-pointer">
                <RowCheckBox checked={sel.isSelected(b.id)} onChange={() => sel.toggle(b.id)} label={`Select banner ${b.alt}`} />
                <span className="text-xs text-gray-500 dark:text-slate-400 truncate">{b.alt}</span>
              </label>
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
          title={confirm.mode === "bulk" ? `Archive ${sel.count} banners?` : "Archive banner?"}
          message="It disappears from the storefront immediately. You can restore it from the archived view."
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
          title="Restore default slides?"
          message={`Archives every current ${placementMeta?.label.toLowerCase()} banner and puts the built-in defaults back. Your banners stay restorable from Show archived.`}
          confirmLabel="Restore defaults"
          onConfirm={handleRestoreDefaults}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
      {history && <ContentHistoryDialog entity="banners" onClose={() => setHistory(false)} />}
    </AdminPage>
  )
}

export default AdminBanners
