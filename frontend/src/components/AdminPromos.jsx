import { useState, useEffect, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, btnPrimary, StatusPill, ConfirmDialog, AdminSelect } from './adminTheme';
import ProductPicker from './ProductPicker.jsx';
import { formatPesos } from '../lib/cartLogic';
import { dateWindowError, END_BEFORE_START } from '../lib/scheduleWindow';
import { BsGift, BsPlusLg, BsPencilSquare, BsTrash } from 'react-icons/bs';
import toast from '../lib/toast.js';

const TYPES = [
  { value: 'percent', label: 'Percent Off' },
  { value: 'fixed', label: 'Fixed Amount Off' },
  { value: 'free_shipping', label: 'Free Shipping' },
];

const SCOPES = [
  { value: 'sitewide', label: 'Sitewide' },
  { value: 'category', label: 'Category' },
  { value: 'product', label: 'Product' },
];

const EMPTY_FORM = {
  code: '',
  type: 'percent',
  value: '',
  scope: 'sitewide',
  target_id: '',
  min_subtotal: '',
  max_discount: '',
  usage_limit: '',
  per_user_limit: '1',
  starts_at: '',
  ends_at: '',
  is_active: true,
};

const inputClass = "h-10 w-full rounded-lg border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#0f2137] px-3 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50";
const labelClass = "block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1";

function typeLabel(type) {
  return TYPES.find((t) => t.value === type)?.label || type;
}

function scopeLabel(scope) {
  return SCOPES.find((s) => s.value === scope)?.label || scope;
}

function promoValueText(promo) {
  if (promo.type === 'percent') return `${Number(promo.value)}% off`;
  if (promo.type === 'fixed') return `PHP ${formatPesos(Number(promo.value))} off`;
  return 'Free shipping';
}

function promoWindow(promo) {
  const now = Date.now();
  const start = promo.starts_at ? new Date(promo.starts_at).getTime() : null;
  const end = promo.ends_at ? new Date(promo.ends_at).getTime() : null;
  if (!promo.is_active) return { kind: 'neutral', label: 'Inactive' };
  if (start && start > now) return { kind: 'info', label: 'Scheduled' };
  if (end && end < now) return { kind: 'danger', label: 'Expired' };
  return { kind: 'success', label: 'Active' };
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formToPayload(form) {
  const payload = {
    code: form.code.trim().toUpperCase(),
    type: form.type,
    value: Number(form.value),
    scope: form.scope,
    max_discount: form.max_discount === '' ? null : Number(form.max_discount),
    usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
    per_user_limit: form.per_user_limit === '' ? 1 : Number(form.per_user_limit),
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : undefined,
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    is_active: form.is_active,
  };
  if (form.scope === 'sitewide') payload.target_id = null;
  else payload.target_id = form.target_id.trim() || null;
  if (String(form.min_subtotal).trim() !== '') payload.min_subtotal = Number(form.min_subtotal);
  return payload;
}

function AdminPromos() {
const [promos, setPromos] = useState([]);
const [loading, setLoading] = useState(true);
const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPromos(); }, []);
useEffect(() => {
  apiGet('/products/categories')
    .then((d) => setCategories(d.items || []))
    .catch(() => { /* dropdown keeps just the saved value */ });
}, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchPromos() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const data = await apiGetAuth('/admin/promos', token);
      setPromos(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load promos');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormData(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(promo) {
    setEditing(promo);
    setFormData({
      code: promo.code,
      type: promo.type,
      value: String(promo.value ?? ''),
      scope: promo.scope || 'sitewide',
      target_id: promo.target_id || '',
      min_subtotal: String(promo.min_subtotal ?? '0'),
      max_discount: promo.max_discount === null || promo.max_discount === undefined ? '' : String(promo.max_discount),
      usage_limit: promo.usage_limit === null || promo.usage_limit === undefined ? '' : String(promo.usage_limit),
      per_user_limit: String(promo.per_user_limit ?? '1'),
      starts_at: toLocalInput(promo.starts_at),
      ends_at: toLocalInput(promo.ends_at),
      is_active: promo.is_active !== false,
    });
    setFormError('');
    setShowForm(true);
  }

  function onChange(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError('');
  }

  function validateForm() {
    if (!formData.code.trim()) return 'Promo code is required.';
    if (!/^[A-Z0-9_-]{2,32}$/.test(formData.code.trim().toUpperCase())) {
      return 'Code must be 2-32 characters: letters, numbers, dash or underscore.';
    }
    if (!formData.type) return 'Discount type is required.';
    if (formData.value === '' || !Number.isFinite(Number(formData.value)) || Number(formData.value) < 0) {
      return 'Value must be a number greater than or equal to 0.';
    }
  if (formData.scope !== 'sitewide' && !formData.target_id.trim()) {
    return formData.scope === 'category'
      ? 'Choose which category this discount applies to.'
      : 'Choose which product this discount applies to.';
  }
    if (formData.min_subtotal !== '' && Number(formData.min_subtotal) < 0) return 'Minimum subtotal must be at least 0.';
    if (formData.max_discount !== '' && Number(formData.max_discount) < 0) return 'Maximum discount must be at least 0.';
    if (formData.usage_limit !== '' && Number(formData.usage_limit) < 1) return 'Usage limit must be at least 1.';
    if (formData.per_user_limit !== '' && Number(formData.per_user_limit) < 1) return 'Per-user limit must be at least 1.';
    if (dateWindowError(formData.starts_at, formData.ends_at)) return END_BEFORE_START;
    return '';
  }

  async function submitForm(e) {
    e.preventDefault();
    if (submitting) return;
    const validationError = validateForm();
    if (validationError) { setFormError(validationError); return; }
    setSubmitting(true);
    setFormError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const payload = formToPayload(formData);
      if (editing) {
        await apiPatchAuth(`/admin/promos/${editing.code}`, payload, token);
        toast.success(`Promo ${payload.code} updated`);
      } else {
        await apiPostAuth('/admin/promos', payload, token);
        toast.success(`Promo ${payload.code} created`);
      }
      setShowForm(false);
      setEditing(null);
      await fetchPromos();
    } catch (err) {
      setFormError(err.message || 'Failed to save promo');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      await apiDeleteAuth(`/admin/promos/${deleteTarget.code}`, token);
      toast.success(`Promo ${deleteTarget.code} deleted`);
      setDeleteTarget(null);
      await fetchPromos();
    } catch (err) {
      toast.error(err.message || 'Failed to delete promo');
      setDeleteTarget(null);
    }
  }

  async function toggleActive(promo) {
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      await apiPatchAuth(`/admin/promos/${promo.code}`, { is_active: promo.is_active === false }, token);
      await fetchPromos();
    } catch (err) {
      toast.error(err.message || 'Failed to update promo');
    }
  }

  const stats = useMemo(() => {
    const active = promos.filter((p) => promoWindow(p).label === 'Active').length;
    const redemptions = promos.reduce((sum, p) => sum + Number(p.usage_count || 0), 0);
    return { active, redemptions, total: promos.length };
  }, [promos]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'type', label: 'Discount' },
    { key: 'scope', label: 'Applies To' },
    { key: 'usage', label: 'Redemptions', sortable: true },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Actions' },
  ];

  const rows = useMemo(() => promos.map((p) => ({
    ...p,
    type: `${typeLabel(p.type)}${p.type === 'free_shipping' ? '' : ` — ${promoValueText(p)}`}`,
    scope: scopeLabel(p.scope),
    usage: `${Number(p.usage_count || 0)}${p.usage_limit !== null && p.usage_limit !== undefined ? ` / ${p.usage_limit}` : ' / unlimited'}`,
    status: <StatusPill kind={promoWindow(p).kind}>{promoWindow(p).label}</StatusPill>,
    actions: (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleActive(p); }}
          className="rounded-lg border border-gray-300 dark:border-[#1e3a5f] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition"
          aria-label={`${p.is_active === false ? 'Activate' : 'Deactivate'} ${p.code}`}
        >
          {p.is_active === false ? 'Activate' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
          className="rounded-lg border border-gray-300 dark:border-[#1e3a5f] p-1.5 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition"
          aria-label={`Edit ${p.code}`}
        >
          <BsPencilSquare className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
          className="rounded-lg border border-red-300 dark:border-red-800 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          aria-label={`Delete ${p.code}`}
        >
          <BsTrash className="h-4 w-4" />
        </button>
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [promos]);

  if (loading) {
    return (
      <AdminPage title="Promos" subtitle="Discount codes and promotions">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <StatCard key={i} label="Loading" value="" loading />)}
        </div>
      </AdminPage>
    );
  }

  if (error) {
    return (
      <AdminPage title="Promos" subtitle="Discount codes and promotions">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200" role="alert">
          <p className="font-semibold mb-2">Could not load promos.</p>
          <p className="mb-3 text-xs">{error}</p>
          <button type="button" onClick={fetchPromos} className={btnPrimary}>Retry</button>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage title="Promos" subtitle="Discount codes and promotions">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total Promos" value={stats.total} />
        <StatCard label="Active Now" value={stats.active} />
        <StatCard label="Total Redemptions" value={stats.redemptions} />
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={openCreate} className={btnPrimary}>
          <span className="flex items-center gap-2"><BsPlusLg /> New Promo</span>
        </button>
      </div>

      {promos.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<BsGift className="h-10 w-10" />}
            title="No promo codes yet"
            message="Create your first promo code to offer discounts at checkout."
            action={<button type="button" onClick={openCreate} className={btnPrimary}>New Promo</button>}
          />
        </div>
      ) : (
        <div className="mt-4">
          <AdminTable
            columns={columns}
            rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
            rowKey={(r) => r.code}
            loading={false}
            colSpan={columns.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            empty={<span>No promo codes.</span>}
            renderMobileCard={(r) => (
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-[#1e3a5f] dark:bg-[#0f2137]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-sm text-gray-900 dark:text-gray-100">{r.code}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{typeLabel(r.type)} — {promoValueText(r)}</p>
                  </div>
                  {r.status}
                </div>
                <dl className="mt-2 space-y-1 text-xs text-gray-600 dark:text-slate-300">
                  <div className="flex justify-between gap-2"><dt>Applies to</dt><dd className="font-medium">{scopeLabel(r.scope)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Redemptions</dt><dd className="font-medium">{r.usage}</dd></div>
                </dl>
                <div className="mt-3 flex items-center justify-end gap-2">{r.actions}</div>
              </div>
            )}
          />
        </div>
      )}

      {showForm && (
        <dialog open className="modal modal-open" aria-label={editing ? 'Edit promo' : 'New promo'}>
          <div className="modal-box max-w-2xl my-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white dark:bg-[#0f2137]">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editing ? `Edit ${editing.code}` : 'New Promo Code'}
            </h3>
            <form onSubmit={submitForm} noValidate>
              {formError && (
                <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{formError}</p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="promo-code" className={labelClass}>Promo Code</label>
                  <input
                    id="promo-code"
                    value={formData.code}
                    onChange={(e) => onChange('code', e.target.value.toUpperCase())}
                    disabled={!!editing}
                    placeholder="SAVE10"
                    className={inputClass}
                    aria-invalid={formError && !formData.code.trim() ? 'true' : undefined}
                  />
                </div>
                <div>
                  <label htmlFor="promo-type" className={labelClass}>Discount Type</label>
                  <AdminSelect id="promo-type" value={formData.type} onChange={(v) => onChange('type', v)} options={TYPES} className={`mt-1.5 ${inputClass}`} />
                </div>
                <div>
                  <label htmlFor="promo-value" className={labelClass}>Value {formData.type === 'percent' ? '(%)' : '(PHP)'}</label>
                  <input
                    id="promo-value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => onChange('value', e.target.value)}
                    disabled={formData.type === 'free_shipping'}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="promo-scope" className={labelClass}>Applies To</label>
                  <AdminSelect id="promo-scope" value={formData.scope} onChange={(v) => onChange('scope', v)} options={SCOPES} className={`mt-1.5 ${inputClass}`} />
                </div>
                {formData.scope === 'category' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="promo-target" className={labelClass}>Which category?</label>
                    <AdminSelect
                      id="promo-target"
                      value={formData.target_id}
                      onChange={(v) => onChange('target_id', v)}
                      ariaLabel="Which category?"
                      className={`mt-1.5 ${inputClass}`}
                      options={[
                        { value: "", label: "Choose a category…" },
                        ...(!categories.includes(formData.target_id) && formData.target_id ? [{ value: formData.target_id, label: `${formData.target_id} (saved)` }] : []),
                        ...categories.map((c) => ({ value: c, label: c })),
                      ]}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Only products in this category get the discount.</p>
                  </div>
                )}
                {formData.scope === 'product' && (
                  <div className="sm:col-span-2">
                    <ProductPicker
                      selected={formData.target_id ? [formData.target_id] : []}
                      max={1}
                      onToggle={(id) => onChange('target_id', formData.target_id === id ? '' : id)}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="promo-min" className={labelClass}>Minimum Subtotal (PHP)</label>
                  <input id="promo-min" type="number" min="0" step="0.01" value={formData.min_subtotal} onChange={(e) => onChange('min_subtotal', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="promo-max" className={labelClass}>Max Discount (PHP, blank = none)</label>
                  <input id="promo-max" type="number" min="0" step="0.01" value={formData.max_discount} onChange={(e) => onChange('max_discount', e.target.value)} disabled={formData.type === 'free_shipping'} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="promo-usage" className={labelClass}>Total Usage Limit (blank = unlimited)</label>
                  <input id="promo-usage" type="number" min="1" value={formData.usage_limit} onChange={(e) => onChange('usage_limit', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="promo-per-user" className={labelClass}>Per User Limit</label>
                  <input id="promo-per-user" type="number" min="1" value={formData.per_user_limit} onChange={(e) => onChange('per_user_limit', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="promo-starts" className={labelClass}>Starts At</label>
                  <input id="promo-starts" type="datetime-local" value={formData.starts_at} onChange={(e) => onChange('starts_at', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="promo-ends" className={labelClass}>Ends At (blank = never)</label>
                  <input id="promo-ends" type="datetime-local" value={formData.ends_at} onChange={(e) => onChange('ends_at', e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={formData.is_active} onChange={(e) => onChange('is_active', e.target.checked)} />
                    Active — customers can redeem this code
                  </label>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditing(null); }}
                  className="min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-[#1e3a5f] text-xs font-black uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="min-h-[44px] px-4 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition disabled:opacity-50">
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Promo'}
                </button>
              </div>
            </form>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => { setShowForm(false); setEditing(null); }}>close</button></form>
        </dialog>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Promo"
        message={`Are you sure you want to delete promo code "${deleteTarget?.code}"? Orders already placed keep their discounts.`}
        confirmLabel="Delete Promo"
        cancelLabel="Keep Promo"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPage>
  );
}

export default AdminPromos;
