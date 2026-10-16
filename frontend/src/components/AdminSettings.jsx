// Phase 6 - Site settings, FAQs and policies. One admin page, three tabs.
// The settings tab groups every field with a "shown in ..." hint so the
// owner can see where each value lands on the storefront.

import React, { useCallback, useEffect, useState } from 'react'
import supabase from '../lib/supabase'
import { apiGetAuth, apiPatchAuth, apiPostAuth, apiDeleteAuth } from '../lib/api.js'
import { AdminPage, btnPrimary, btnGhost, StatusPill, ConfirmDialog } from './adminTheme.jsx'
import ImagePicker from './ImagePicker.jsx'
import ContentHistoryDialog from './ContentHistoryDialog.jsx'

const TABS = [
  { id: 'settings', label: 'Store settings' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'policies', label: 'Policy pages' },
]

const DEFAULT_FORM = {
  store_name: '',
  tagline: '',
  logo_url: '',
  contact_phone: '',
  contact_email: '',
  contact_address: '',
  store_hours: '',
  shipping_fee: 75,
  free_shipping_threshold: '',
  payment_methods: [],
  maintenance: { enabled: false, message: '' },
  low_stock_threshold: 10,
}

const DEFAULT_METHODS = [
  { id: 'gcash', label: 'GCash', enabled: true, instructions: '', qr_url: null },
  { id: 'paymaya', label: 'PayMaya', enabled: true, instructions: '', qr_url: null },
  { id: 'cod', label: 'COD (Cash on Delivery)', enabled: true, instructions: '', qr_url: null },
]

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-[#2c4a6f] bg-white dark:bg-[#0b2237] px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0b2e59] dark:focus:ring-yellow-400'

export default function AdminSettings() {
  const [tab, setTab] = useState('settings')
  const [settings, setSettings] = useState(DEFAULT_FORM)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [seeded, setSeeded] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveOk, setSaveOk] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [faqs, setFaqs] = useState([])
  const [faqArchived, setFaqArchived] = useState(false)
  const [faqDialog, setFaqDialog] = useState(null) // {item|null, form}
  const [faqBusy, setFaqBusy] = useState(false)
  const [faqError, setFaqError] = useState('')

  const [policies, setPolicies] = useState([])
  const [policyArchived, setPolicyArchived] = useState(false)
  const [policyDialog, setPolicyDialog] = useState(null)
  const [policyBusy, setPolicyBusy] = useState(false)
  const [policyError, setPolicyError] = useState('')

  const [confirm, setConfirm] = useState(null)
  const [historyEntity, setHistoryEntity] = useState(null)

  const sessionToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, [])

  const toForm = (s) => ({
    ...DEFAULT_FORM,
    ...s,
    logo_url: s.logo_url || '',
    free_shipping_threshold: s.free_shipping_threshold ?? '',
    payment_methods: (s.payment_methods && s.payment_methods.length ? s.payment_methods : DEFAULT_METHODS).map((m) => ({ ...m, qr_url: m.qr_url || '' })),
    maintenance: { enabled: Boolean(s.maintenance?.enabled), message: s.maintenance?.message || '' },
  })

  const loadSettings = useCallback(async () => {
    try {
      const token = await sessionToken()
      const data = await apiGetAuth('/admin/settings', token)
      setSettings(toForm(data.settings || {}))
      setUpdatedAt(data.updated_at || null)
      setSeeded(data.seeded !== false)
      setLoadError('')
    } catch (err) {
      setLoadError(err.message || 'Failed to load settings')
    }
  }, [sessionToken])

  const loadFaqs = useCallback(async () => {
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/faqs?archived=${faqArchived}`, token)
      setFaqs(data.items || [])
    } catch {
      setFaqs([])
    }
  }, [faqArchived, sessionToken])

  const loadPolicies = useCallback(async () => {
    try {
      const token = await sessionToken()
      const data = await apiGetAuth(`/admin/policies?archived=${policyArchived}`, token)
      setPolicies(data.items || [])
    } catch {
      setPolicies([])
    }
  }, [policyArchived, sessionToken])

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadFaqs() }, [loadFaqs])
  useEffect(() => { loadPolicies() }, [loadPolicies])

  const setField = (key, value) => setSettings((s) => ({ ...s, [key]: value }))
  const setMethod = (id, patch) =>
    setSettings((s) => ({
      ...s,
      payment_methods: s.payment_methods.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))

  const saveSettings = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    setSaveOk(false)
    try {
      const token = await sessionToken()
      const payload = {
        ...settings,
        logo_url: settings.logo_url || null,
        free_shipping_threshold: settings.free_shipping_threshold === '' ? null : Number(settings.free_shipping_threshold),
        shipping_fee: Number(settings.shipping_fee),
        low_stock_threshold: Number(settings.low_stock_threshold),
      }
      // the margin-warning knob was retired (margins render green/red only) -
      // never write the legacy key again
      delete payload.margin_warning_percent
      const data = await apiPatchAuth('/admin/settings', payload, token)
      setSettings(toForm(data.settings || {}))
      setUpdatedAt(data.updated_at || null)
      setSeeded(true)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const saveFaq = async (e) => {
    e.preventDefault()
    setFaqBusy(true)
    setFaqError('')
    try {
      const token = await sessionToken()
      const { item, form } = faqDialog
      const payload = { question: form.question, answer: form.answer, is_visible: form.is_visible, sort_order: form.sort_order === '' ? undefined : Number(form.sort_order) }
      if (item) await apiPatchAuth(`/admin/faqs/${item.id}`, payload, token)
      else await apiPostAuth('/admin/faqs', payload, token)
      setFaqDialog(null)
      loadFaqs()
    } catch (err) {
      setFaqError(err.message || 'Failed to save FAQ')
    } finally {
      setFaqBusy(false)
    }
  }

  const savePolicy = async (e) => {
    e.preventDefault()
    setPolicyBusy(true)
    setPolicyError('')
    try {
      const token = await sessionToken()
      const { item, form } = policyDialog
      const payload = { title: form.title, slug: form.slug || undefined, body: form.body, is_visible: form.is_visible }
      if (item) await apiPatchAuth(`/admin/policies/${item.id}`, payload, token)
      else await apiPostAuth('/admin/policies', payload, token)
      setPolicyDialog(null)
      loadPolicies()
    } catch (err) {
      setPolicyError(err.message || 'Failed to save policy')
    } finally {
      setPolicyBusy(false)
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    const token = await sessionToken()
    try {
      if (confirm.kind === 'faq-archive') await apiDeleteAuth(`/admin/faqs/${confirm.item.id}`, token)
      if (confirm.kind === 'faq-restore') await apiPostAuth(`/admin/faqs/${confirm.item.id}/restore`, {}, token)
      if (confirm.kind === 'policy-archive') await apiDeleteAuth(`/admin/policies/${confirm.item.id}`, token)
      if (confirm.kind === 'policy-restore') await apiPostAuth(`/admin/policies/${confirm.item.id}/restore`, {}, token)
      setConfirm(null)
      loadFaqs()
      loadPolicies()
    } catch (err) {
      setConfirm(null)
      alert(err.message || 'Action failed')
    }
  }

  const moveFaq = async (index, delta) => {
    const next = [...faqs]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setFaqs(next)
    try {
      const token = await sessionToken()
      await apiPostAuth('/admin/faqs/reorder', { ids: next.map((f) => f.id) }, token)
    } catch {
      loadFaqs()
    }
  }

  return (
    <AdminPage title="Site Settings" subtitle="Store identity, contact, shipping, payments, FAQs and policy pages - everything the storefront shows outside the catalog.">
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition ${tab === t.id ? 'bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900' : 'border border-gray-300 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a]'}`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={() => setHistoryEntity(tab === 'settings' ? 'site_settings' : tab)} className={`${btnGhost} ml-auto`}>
          History
        </button>
      </div>

      {tab === 'settings' && (
        <form onSubmit={saveSettings} className="space-y-6">
          {!seeded && (
            <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm px-3 py-2" role="status">
              Defaults shown below are not saved yet - press Save to write them to the database (requires the Phase 6 migration).
            </p>
          )}
          {loadError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-3 py-2 flex items-center justify-between gap-3" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={() => { loadSettings(); loadFaqs(); loadPolicies() }} className="shrink-0 font-bold uppercase tracking-widest underline">Retry</button>
            </div>
          )}

          <section className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-4 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-white">Store identity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="store-name" label="Store name" hint="Shown in the footer, receipts and page title.">
                <input id="store-name" className={inputCls} value={settings.store_name} onChange={(e) => setField('store_name', e.target.value)} maxLength={80} />
              </Field>
              <Field id="store-tagline" label="Tagline" hint="Optional short line under the store name.">
                <input id="store-tagline" className={inputCls} value={settings.tagline} onChange={(e) => setField('tagline', e.target.value)} maxLength={160} />
              </Field>
            </div>
            <ImagePicker label="Logo" value={settings.logo_url || null} onChange={(v) => setField('logo_url', v || '')} />
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-4 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-white">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="contact-phone" label="Phone" hint="Shown on the floating contact button and contact page.">
                <input id="contact-phone" className={inputCls} value={settings.contact_phone} onChange={(e) => setField('contact_phone', e.target.value)} maxLength={40} />
              </Field>
              <Field id="contact-email" label="Email">
                <input id="contact-email" type="email" className={inputCls} value={settings.contact_email} onChange={(e) => setField('contact_email', e.target.value)} maxLength={120} />
              </Field>
              <Field id="contact-address" label="Address" hint="Shown in the footer and on receipts.">
                <input id="contact-address" className={inputCls} value={settings.contact_address} onChange={(e) => setField('contact_address', e.target.value)} maxLength={200} />
              </Field>
              <Field id="store-hours" label="Store hours" hint="Shown in the footer.">
                <input id="store-hours" className={inputCls} value={settings.store_hours} onChange={(e) => setField('store_hours', e.target.value)} maxLength={160} />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-4 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-white">Shipping</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="shipping-fee" label="Flat shipping fee (PHP)" hint="Charged once per order. Shown in the cart and checkout.">
                <input id="shipping-fee" type="number" min="0" step="0.01" className={inputCls} value={settings.shipping_fee} onChange={(e) => setField('shipping_fee', e.target.value)} />
              </Field>
              <Field id="free-threshold" label="Free shipping at subtotal (PHP)" hint="Leave empty to keep charging the flat fee at every order size.">
                <input id="free-threshold" type="number" min="0" step="0.01" className={inputCls} value={settings.free_shipping_threshold} onChange={(e) => setField('free_shipping_threshold', e.target.value)} placeholder="off" />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-4 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-white">Payment methods</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">Shoppers only see enabled methods at checkout. Instructions and QR images appear on the order confirmation and receipt.</p>
            {settings.payment_methods.map((m) => (
              <div key={m.id} className="rounded-lg border border-gray-200 dark:border-[#2c4a6f] p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => setMethod(m.id, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] dark:text-yellow-400 focus:ring-[#0b2e59] dark:focus:ring-yellow-400"
                  />
                  {m.label || m.id.toUpperCase()} <span className="text-xs font-normal text-gray-400">({m.id})</span>
                </label>
                <Field id={`pm-label-${m.id}`} label="Label shown to shoppers">
                  <input id={`pm-label-${m.id}`} className={inputCls} value={m.label} onChange={(e) => setMethod(m.id, { label: e.target.value })} maxLength={40} />
                </Field>
                <Field id={`pm-instructions-${m.id}`} label="Instructions" hint="E.g. the GCash number to send to, or COD notes.">
                  <textarea id={`pm-instructions-${m.id}`} className={inputCls} rows={2} value={m.instructions} onChange={(e) => setMethod(m.id, { instructions: e.target.value })} maxLength={1000} />
                </Field>
                <ImagePicker label="QR image (optional)" value={m.qr_url || null} onChange={(v) => setMethod(m.id, { qr_url: v || null })} />
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-4 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-white">Storefront health</h3>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={settings.maintenance.enabled}
                onChange={(e) => setField('maintenance', { ...settings.maintenance, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] dark:text-yellow-400 focus:ring-[#0b2e59] dark:focus:ring-yellow-400"
              />
              Maintenance mode - hide the shop from shoppers (admins still see it)
            </label>
            <Field id="maintenance-message" label="Message shoppers see" hint="Shown on the maintenance screen.">
              <input id="maintenance-message" className={inputCls} value={settings.maintenance.message} onChange={(e) => setField('maintenance', { ...settings.maintenance, message: e.target.value })} maxLength={300} placeholder="We'll be back soon!" />
            </Field>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-4 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-white">Warning thresholds</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">One place to set where warnings appear - the dashboard reads these, and the low stock line also drives the storefront's "Only N left" chips.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="low-stock" label="Low stock warning at" hint="Products at or below this stock show a warning in the dashboard and on product cards.">
                <input id="low-stock" type="number" min="0" step="1" className={inputCls} value={settings.low_stock_threshold} onChange={(e) => setField('low_stock_threshold', e.target.value)} />
              </Field>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : 'Save settings'}
            </button>
            {saveOk && <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" role="status">Saved</span>}
            {saveError && <span className="text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{saveError}</span>}
            {updatedAt && <span className="text-xs text-gray-400">Last saved {new Date(updatedAt).toLocaleString()}</span>}
          </div>
        </form>
      )}

      {tab === 'faqs' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input type="checkbox" checked={faqArchived} onChange={(e) => setFaqArchived(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] dark:text-yellow-400 focus:ring-[#0b2e59] dark:focus:ring-yellow-400" />
              Show archived
            </label>
            {!faqArchived && (
              <button
                className={btnPrimary}
                onClick={() => { setFaqError(''); setFaqDialog({ item: null, form: { question: '', answer: '', is_visible: true, sort_order: '' } }) }}
              >
                New FAQ
              </button>
            )}
          </div>
          {faqs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 dark:border-[#2c4a6f] p-8 text-center text-sm text-gray-500 dark:text-slate-400">
              {faqArchived ? 'No archived FAQs.' : 'No FAQs yet - the About page keeps its built-in ones until you add yours here.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {faqs.map((f, i) => (
                <li key={f.id} className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-3 flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill kind={f.is_visible ? 'success' : 'neutral'}>{f.is_visible ? 'Visible' : 'Hidden'}</StatusPill>
                      {f.archived_at && <StatusPill kind="warning">Archived</StatusPill>}
                      <span className="text-xs text-gray-400">#{f.sort_order}</span>
                    </div>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">{f.question}</p>
                    <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2">{f.answer}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!f.archived_at && (
                      <>
                        <button type="button" className={btnGhost} onClick={() => moveFaq(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                        <button type="button" className={btnGhost} onClick={() => moveFaq(i, 1)} disabled={i === faqs.length - 1} aria-label="Move down">↓</button>
                      </>
                    )}
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => { setFaqError(''); setFaqDialog({ item: f, form: { question: f.question, answer: f.answer, is_visible: f.is_visible, sort_order: f.sort_order } }) }}
                    >
                      Edit
                    </button>
                    {f.archived_at ? (
                      <button type="button" className={btnGhost} onClick={() => setConfirm({ kind: 'faq-restore', item: f })}>Restore</button>
                    ) : (
                      <button type="button" className={btnGhost} onClick={() => setConfirm({ kind: 'faq-archive', item: f })}>Archive</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'policies' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input type="checkbox" checked={policyArchived} onChange={(e) => setPolicyArchived(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] dark:text-yellow-400 focus:ring-[#0b2e59] dark:focus:ring-yellow-400" />
              Show archived
            </label>
            {!policyArchived && (
              <button
                className={btnPrimary}
                onClick={() => { setPolicyError(''); setPolicyDialog({ item: null, form: { title: '', slug: '', body: '', is_visible: true } }) }}
              >
                New policy page
              </button>
            )}
          </div>
          {policies.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 dark:border-[#2c4a6f] p-8 text-center text-sm text-gray-500 dark:text-slate-400">
              {policyArchived ? 'No archived policy pages.' : 'No policy pages yet - create one and link to it from the footer (Navigation page) or an FAQ.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {policies.map((p) => (
                <li key={p.id} className="rounded-xl border border-gray-200 dark:border-[#1e3a5f] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill kind={p.is_visible ? 'success' : 'neutral'}>{p.is_visible ? 'Visible' : 'Hidden'}</StatusPill>
                      {p.archived_at && <StatusPill kind="warning">Archived</StatusPill>}
                      <code className="text-xs text-gray-500 dark:text-slate-400">/policies/{p.slug}</code>
                    </div>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">{p.title}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => { setPolicyError(''); setPolicyDialog({ item: p, form: { title: p.title, slug: p.slug, body: p.body, is_visible: p.is_visible } }) }}
                    >
                      Edit
                    </button>
                    {p.archived_at ? (
                      <button type="button" className={btnGhost} onClick={() => setConfirm({ kind: 'policy-restore', item: p })}>Restore</button>
                    ) : (
                      <button type="button" className={btnGhost} onClick={() => setConfirm({ kind: 'policy-archive', item: p })}>Archive</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {faqDialog && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={faqDialog.item ? 'Edit FAQ' : 'New FAQ'}>
          <form onSubmit={saveFaq} className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-3 border border-gray-200 dark:border-[#1e3a5f]">
            <h3 className="font-black text-lg text-gray-900 dark:text-white">{faqDialog.item ? 'Edit FAQ' : 'New FAQ'}</h3>
            <Field id="faq-q" label="Question">
              <textarea id="faq-q" required className={inputCls} rows={2} value={faqDialog.form.question} onChange={(e) => setFaqDialog((d) => ({ ...d, form: { ...d.form, question: e.target.value } }))} maxLength={200} />
            </Field>
            <Field id="faq-a" label="Answer">
              <textarea id="faq-a" required className={inputCls} rows={5} value={faqDialog.form.answer} onChange={(e) => setFaqDialog((d) => ({ ...d, form: { ...d.form, answer: e.target.value } }))} maxLength={2000} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input type="checkbox" checked={faqDialog.form.is_visible} onChange={(e) => setFaqDialog((d) => ({ ...d, form: { ...d.form, is_visible: e.target.checked } }))} className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] dark:text-yellow-400 focus:ring-[#0b2e59] dark:focus:ring-yellow-400" />
              Visible on the About page
            </label>
            {faqError && <p className="text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{faqError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setFaqDialog(null)}>Cancel</button>
              <button type="submit" disabled={faqBusy} className={btnPrimary}>{faqBusy ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {policyDialog && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={policyDialog.item ? 'Edit policy' : 'New policy page'}>
          <form onSubmit={savePolicy} className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-3 border border-gray-200 dark:border-[#1e3a5f]">
            <h3 className="font-black text-lg text-gray-900 dark:text-white">{policyDialog.item ? 'Edit policy' : 'New policy page'}</h3>
            <Field id="policy-title" label="Title">
              <input id="policy-title" required className={inputCls} value={policyDialog.form.title} onChange={(e) => setPolicyDialog((d) => ({ ...d, form: { ...d.form, title: e.target.value } }))} maxLength={120} />
            </Field>
            <Field id="policy-slug" label="URL slug" hint="Becomes /policies/your-slug. Leave blank to derive from the title.">
              <input id="policy-slug" className={inputCls} value={policyDialog.form.slug} onChange={(e) => setPolicyDialog((d) => ({ ...d, form: { ...d.form, slug: e.target.value } }))} maxLength={80} />
            </Field>
            <Field id="policy-body" label="Page content" hint="Plain text. Blank lines separate paragraphs.">
              <textarea id="policy-body" className={inputCls} rows={8} value={policyDialog.form.body} onChange={(e) => setPolicyDialog((d) => ({ ...d, form: { ...d.form, body: e.target.value } }))} maxLength={20000} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input type="checkbox" checked={policyDialog.form.is_visible} onChange={(e) => setPolicyDialog((d) => ({ ...d, form: { ...d.form, is_visible: e.target.checked } }))} className="h-4 w-4 rounded border-gray-300 text-[#0b2e59] dark:text-yellow-400 focus:ring-[#0b2e59] dark:focus:ring-yellow-400" />
              Visible (shoppers can open the page)
            </label>
            {policyError && <p className="text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{policyError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setPolicyDialog(null)}>Cancel</button>
              <button type="submit" disabled={policyBusy} className={btnPrimary}>{policyBusy ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind?.startsWith('policy') ? 'Policy page' : 'FAQ'}
        message={
          confirm?.kind === 'faq-archive' ? 'Archive this FAQ? It disappears from the About page and can be restored.'
          : confirm?.kind === 'faq-restore' ? 'Restore this FAQ to the About page?'
          : confirm?.kind === 'policy-archive' ? 'Archive this policy page? Its link stops working and it can be restored.'
          : 'Restore this policy page?'
        }
        confirmLabel={confirm?.kind?.endsWith('restore') ? 'Restore' : 'Archive'}
        danger={Boolean(confirm && !confirm.kind.endsWith('restore'))}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />

      {historyEntity && <ContentHistoryDialog entity={historyEntity} onClose={() => setHistoryEntity(null)} />}
    </AdminPage>
  )
}
