import React, { useState, useEffect, useMemo, useRef } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth, apiUploadAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, btnPrimary, StatusPill, ConfirmDialog } from './adminTheme';
import { SECTION_LABELS, detailsToFields, fieldsToDetails } from '../lib/productInfo';
import { formatPesos } from '../lib/cartLogic';
import { formatMargin } from '../lib/adminCosting';
import { useRole } from '../context/RoleContext';
import { canSeeCosts, canManageProductLifecycle } from '../lib/permissions';
import { BsBoxSeam, BsPlusLg, BsDashLg, BsPencilSquare, BsTrash, BsUpload, BsSearch, BsExclamationTriangle, BsArrowClockwise, BsArchive, BsArrowCounterclockwise, BsClockHistory } from 'react-icons/bs';
import toast from 'react-hot-toast';

// cost/supplier payload rules: filled = send the value; blank with no prior
// value = omit the key (so a create/edit works against a pre-M2 database);
// blank with a prior value = explicit null to clear it.
function costPatchFields(form, original, showCosts) {
  if (!showCosts) return {};
  const fields = {};
  if (form.cost_price !== '') fields.cost_price = Number(form.cost_price);
  else if (original?.cost_price != null) fields.cost_price = null;
  if (form.supplier.trim() !== '') fields.supplier = form.supplier.trim();
  else if (original?.supplier != null) fields.supplier = null;
  return fields;
}

function invalidCostValue(value) {
  if (value === '') return false;
  const n = Number(value);
  return !Number.isFinite(n) || n < 0;
}

const AdminProductManagement = () => {
  const role = useRole();
  const showCosts = canSeeCosts(role);
  const canLifecycle = canManageProductLifecycle(role);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingOriginal, setEditingOriginal] = useState(null);
  const [formData, setFormData] = useState({ prod_name: '', category: '', brand: '', price: '', stock_quantity: '0', is_active: true, image_url: '', description: '', details: {}, cost_price: '', supplier: '' });
  const [sortKey, setSortKey] = useState('prod_name');
  const [sortDir, setSortDir] = useState('asc');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [mobileEditItem, setMobileEditItem] = useState(null);
  const [mobileForm, setMobileForm] = useState({ prod_name: '', category: '', brand: '', price: '', stock_quantity: '0', is_active: true, image_url: '', description: '', details: {}, cost_price: '', supplier: '' });
  const [mobileUploading, setMobileUploading] = useState(false);
  const [mobileDragging, setMobileDragging] = useState(false);
  const [mobileUrlInput, setMobileUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mobileSubmitting, setMobileSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyRows, setHistoryRows] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const fileInputRef = useRef(null);
  const mobileFileRef = useRef(null);
  const PAGE_SIZE = 10;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProducts(); }, [reloadKey]);

  useEffect(() => {
    if (!mobileEditItem) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileEditItem(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileEditItem]);

  useEffect(() => {
    if (!historyTarget) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setHistoryTarget(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [historyTarget]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchProducts() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken(); if (!token) return;
      const all = [];
      // archived=all: the view split (catalog vs archived) happens client-side
      // so the Archived toggle needs no refetch
      for (let p = 1; p <= 100; p++) {
        const { items, total } = await apiGetAuth(`/admin/products?page=${p}&pageSize=100&archived=all`, token);
        all.push(...(items || []));
        if (!items || items.length < 100 || all.length >= (total ?? 0)) break;
      }
      setProducts(all);
    } catch (err) { setError(err.message || 'Could not reach the server.'); }
    finally { setLoading(false); }
  }

  function startEdit(item) {
    setEditing(item.prod_id);
    setEditingOriginal(item);
    setFormData({
      prod_name: item.prod_name || '',
      category: item.category || '',
      brand: item.brand || '',
      price: String(item.price ?? ''),
      stock_quantity: String(item.stock_quantity ?? 0),
      is_active: item.is_active !== false,
      image_url: item.image_url || '',
      description: item.description || '',
      details: detailsToFields(item.details),
      cost_price: item.cost_price != null ? String(item.cost_price) : '',
      supplier: item.supplier || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditing(null);
    setEditingOriginal(null);
    setFormData({ prod_name: '', category: '', brand: '', price: '', stock_quantity: '0', is_active: true, image_url: '', description: '', details: {}, cost_price: '', supplier: '' });
  }

  const handleFileUpload = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('image', file);
      const token = await getToken(); if (!token) return;
      const { url } = await apiUploadAuth('/admin/images/upload', fd, token);
      setFormData((f) => ({ ...f, image_url: url }));
      toast.success('Image uploaded');
    } catch (error) { toast.error('Error uploading image: ' + error.message); }
    finally { setUploading(false); }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFileUpload(file);
  };

  const handleUrlUpload = async () => {
    if (!urlInput.trim()) return;
    try {
      setUploading(true);
      const token = await getToken(); if (!token) return;
      const { url } = await apiUploadAuth('/admin/images/upload', { imageUrl: urlInput.trim() }, token);
      setFormData((f) => ({ ...f, image_url: url }));
      setUrlInput('');
      toast.success('Image fetched and uploaded');
    } catch (error) { toast.error('Error fetching image: ' + error.message); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!editing && !canLifecycle) return;
    const stock = Number(formData.stock_quantity);
    const price = Number(formData.price);
    if (!formData.prod_name.trim() || !formData.category.trim()) {
      toast.error('Product name and category are required');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Price must be a number of 0 or more');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      toast.error('Stock quantity must be a whole number of 0 or more');
      return;
    }
    if (invalidCostValue(formData.cost_price)) {
      toast.error('Cost must be a number of 0 or more');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken(); if (!token) return;
      const payload = {
        prod_name: formData.prod_name.trim(),
        category: formData.category.trim(),
        brand: formData.brand?.trim() || null,
        price,
        stock_quantity: stock,
        is_active: formData.is_active,
        image_url: formData.image_url,
        description: formData.description || null,
        details: fieldsToDetails(formData.details),
        ...costPatchFields(formData, editingOriginal, showCosts),
      };
      if (editing) {
        await apiPatchAuth(`/admin/products/${editing}`, payload, token);
        toast.success('Product updated');
      } else {
        await apiPostAuth('/admin/products', payload, token);
        toast.success('Product created');
      }
      resetForm(); setShowForm(false); await fetchProducts();
    } catch (error) { toast.error(error.message); }
    finally { setSubmitting(false); }
  };

  async function adjustStock(item, delta) {
    const next = Math.max(0, Number(item.stock_quantity || 0) + delta);
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/products/${item.prod_id}`, { stock_quantity: next }, token);
      setProducts((prev) => prev.map((p) => p.prod_id === item.prod_id ? { ...p, stock_quantity: next } : p));
      toast.success(`Stock ${delta > 0 ? 'increased' : 'decreased'} to ${next}`);
    } catch (err) { toast.error(err.message); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const token = await getToken(); if (!token) return;
      await apiDeleteAuth(`/admin/products/${deleteTarget.prod_id}`, token);
      setProducts((prev) => prev.filter((p) => p.prod_id !== deleteTarget.prod_id));
      toast.success('Product deleted');
    } catch (err) {
      // 409 HAS_ORDER_HISTORY: the server message explains archiving instead
      toast.error(err.message);
    }
    finally { setDeleteTarget(null); }
  }

  async function toggleArchive(item) {
    const archiving = !item.archived_at;
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/products/${item.prod_id}`, { archived: archiving }, token);
      toast.success(archiving ? 'Product archived' : 'Product restored');
      await fetchProducts();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function loadHistory(item) {
    setHistoryTarget(item);
    setHistoryRows(null);
    setHistoryError(null);
    try {
      const token = await getToken(); if (!token) return;
      const data = await apiGetAuth(`/admin/products/${item.prod_id}/price-history`, token);
      setHistoryRows(data.items || []);
    } catch (err) {
      setHistoryError(err.message || 'Could not load price history.');
    }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function openMobileEdit(item) {
    setMobileEditItem(item);
    setMobileForm({
      prod_name: item.prod_name || '',
      category: item.category || '',
      brand: item.brand || '',
      price: String(item.price ?? ''),
      stock_quantity: String(item.stock_quantity ?? 0),
      is_active: item.is_active !== false,
      image_url: item.image_url || '',
      description: item.description || '',
      details: detailsToFields(item.details),
      cost_price: item.cost_price != null ? String(item.cost_price) : '',
      supplier: item.supplier || '',
    });
  }

  async function handleMobileUpload(file) {
    if (!file) return;
    try {
      setMobileUploading(true);
      const fd = new FormData();
      fd.append('image', file);
      const token = await getToken(); if (!token) return;
      const { url } = await apiUploadAuth('/admin/images/upload', fd, token);
      setMobileForm((f) => ({ ...f, image_url: url }));
      toast.success('Image uploaded');
    } catch (error) { toast.error('Upload failed: ' + error.message); }
    finally { setMobileUploading(false); }
  }

  async function handleMobileUrlUpload() {
    if (!mobileUrlInput.trim()) return;
    try {
      setMobileUploading(true);
      const token = await getToken(); if (!token) return;
      const { url } = await apiUploadAuth('/admin/images/upload', { imageUrl: mobileUrlInput.trim() }, token);
      setMobileForm((f) => ({ ...f, image_url: url }));
      setMobileUrlInput('');
      toast.success('Image fetched');
    } catch (error) { toast.error('Fetch failed: ' + error.message); }
    finally { setMobileUploading(false); }
  }

  async function handleMobileSubmit(e) {
    e.preventDefault();
    if (!mobileEditItem || mobileSubmitting) return;
    const stock = Number(mobileForm.stock_quantity);
    const price = Number(mobileForm.price);
    if (!mobileForm.prod_name.trim() || !mobileForm.category.trim()) {
      toast.error('Product name and category are required');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Price must be a number of 0 or more');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      toast.error('Stock quantity must be a whole number of 0 or more');
      return;
    }
    if (invalidCostValue(mobileForm.cost_price)) {
      toast.error('Cost must be a number of 0 or more');
      return;
    }
    setMobileSubmitting(true);
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/products/${mobileEditItem.prod_id}`, {
        prod_name: mobileForm.prod_name.trim(),
        category: mobileForm.category.trim(),
        brand: mobileForm.brand?.trim() || null,
        price,
        stock_quantity: stock,
        is_active: mobileForm.is_active,
        image_url: mobileForm.image_url,
        description: mobileForm.description || null,
        details: fieldsToDetails(mobileForm.details),
        ...costPatchFields(mobileForm, mobileEditItem, showCosts),
      }, token);
      toast.success('Product updated');
      setMobileEditItem(null);
      await fetchProducts();
    } catch (error) { toast.error(error.message); }
    finally { setMobileSubmitting(false); }
  }

  // the archived toggle switches the base list; category/search/price filters
  // then apply on top of whichever view is active
  const catalogList = useMemo(() => products.filter((p) => !p.archived_at), [products]);
  const archivedItems = useMemo(() => products.filter((p) => p.archived_at), [products]);
  const viewList = showArchived ? archivedItems : catalogList;

  const categories = useMemo(() => {
    const cats = [...new Set(viewList.map((p) => p.category).filter(Boolean))].sort();
    return ['All', ...cats];
  }, [viewList]);

  const displayed = useMemo(() => {
    let list = [...viewList];
    if (categoryFilter !== 'All') list = list.filter((p) => p.category === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const name = (p.prod_name || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    }
    const min = priceMin !== '' ? Number(priceMin) : null;
    const max = priceMax !== '' ? Number(priceMax) : null;
    if (min !== null) list = list.filter((p) => Number(p.price || 0) >= min);
    if (max !== null) list = list.filter((p) => Number(p.price || 0) <= max);

    list.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'price':
          va = Number(a.price || 0);
          vb = Number(b.price || 0);
          break;
        case 'stock_quantity':
          va = Number(a.stock_quantity || 0);
          vb = Number(b.stock_quantity || 0);
          break;
        case 'prod_name':
          va = (a.prod_name || '').toLowerCase();
          vb = (b.prod_name || '').toLowerCase();
          break;
        case 'category':
          va = (a.category || '').toLowerCase();
          vb = (b.category || '').toLowerCase();
          break;
        default:
          va = a[sortKey] ?? '';
          vb = b[sortKey] ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [viewList, sortKey, sortDir, priceMin, priceMax, search, categoryFilter]);

  // operational stats always describe the live catalog, not the archived view
  const totalProducts = catalogList.length;
  const lowStockCount = catalogList.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 10).length;
  const outOfStockCount = catalogList.filter((p) => p.stock_quantity <= 0).length;

  // ARCHIVED beats HIDDEN beats OUT beats ACTIVE — the badge rules
  function productBadge(item) {
    if (item.archived_at) return { kind: 'info', label: 'ARCHIVED' };
    if (item.is_active === false) return { kind: 'neutral', label: 'HIDDEN' };
    if (Number(item.stock_quantity || 0) <= 0) return { kind: 'danger', label: 'OUT' };
    return { kind: 'success', label: 'ACTIVE' };
  }

  const columns = [
    { key: 'img', label: 'Image', render: (item) => (
      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-[#162d4a] overflow-hidden flex items-center justify-center">
        {item.image_url
          ? <img src={item.image_url} alt={item.prod_name} loading="lazy" className="w-full h-full object-cover" />
          : <span className="text-[10px] text-gray-400 dark:text-slate-500">N/A</span>}
      </div>
    ) },
    { key: 'prod_name', label: 'Name', sortable: true, render: (item) => <span className="font-bold text-gray-900 dark:text-slate-100">{item.prod_name}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (item) => (
      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-[#162d4a] text-gray-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f]">{item.category}</span>
    ) },
    { key: 'price', label: 'Price', sortable: true, render: (item) => <span className="font-black text-[#0b2e59] dark:text-yellow-200">PHP {formatPesos(Number(item.price || 0))}</span> },
    ...(showCosts ? [
      { key: 'cost_price', label: 'Cost', sortable: true, render: (item) => (
        <span className="text-gray-700 dark:text-slate-300">{item.cost_price != null ? `PHP ${formatPesos(Number(item.cost_price))}` : '—'}</span>
      ) },
      { key: 'margin', label: 'Margin', render: (item) => {
        const margin = formatMargin(item.price, item.cost_price);
        const negative = margin.startsWith('-');
        return <span className={`font-black ${margin === '—' ? 'text-gray-400 dark:text-slate-500' : negative ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{margin}</span>;
      } },
    ] : []),
    { key: 'stock_quantity', label: 'Stock', sortable: true, render: (item) => <span className="text-gray-700 dark:text-slate-300">{item.stock_quantity}</span> },
    { key: 'status', label: 'Status', render: (item) => {
      const s = productBadge(item);
      return <StatusPill kind={s.kind}>{s.label}</StatusPill>;
    } },
    { key: 'actions', label: 'Actions', render: (item) => (
      <div className="flex items-center gap-1">
        <button onClick={() => startEdit(item)} className="p-1.5 rounded bg-[#facc15] hover:bg-[#fde047] text-black" title="Edit"><BsPencilSquare /></button>
        <button onClick={() => adjustStock(item, -1)} className="p-1.5 rounded bg-gray-100 dark:bg-[#162d4a] hover:bg-gray-200 dark:hover:bg-[#1e3a5f] text-gray-700 dark:text-slate-300" title="Decrease stock"><BsDashLg /></button>
        <button onClick={() => adjustStock(item, +1)} className="p-1.5 rounded bg-gray-100 dark:bg-[#162d4a] hover:bg-gray-200 dark:hover:bg-[#1e3a5f] text-gray-700 dark:text-slate-300" title="Increase stock"><BsPlusLg /></button>
        <button onClick={() => loadHistory(item)} className="p-1.5 rounded bg-gray-100 dark:bg-[#162d4a] hover:bg-gray-200 dark:hover:bg-[#1e3a5f] text-gray-700 dark:text-slate-300" title="Price history"><BsClockHistory /></button>
        {canLifecycle && (
          item.archived_at
            ? <button onClick={() => toggleArchive(item)} className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white" title="Restore from archive"><BsArrowCounterclockwise /></button>
            : <button onClick={() => toggleArchive(item)} className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white" title="Archive (hide from store, keep order history)"><BsArchive /></button>
        )}
        {canLifecycle && (
          <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white" title="Delete"><BsTrash /></button>
        )}
      </div>
    ) },
  ];

  return (
    <AdminPage title="Product Management" subtitle="Curate the items shoppers can buy.">

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard label="Total Products" value={totalProducts} loading={loading} />
        <StatCard label="Low Stock" value={lowStockCount} loading={loading} />
        <StatCard label="Out of Stock" value={outOfStockCount} loading={loading} />
      </div>

      {(showForm || canLifecycle) && (
        <div className="flex justify-end mb-4">
          <button onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }} className={btnPrimary}>
            {showForm ? 'Cancel' : '+ New Product'}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-5 rounded-xl border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0f2137] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <input value={formData.prod_name} onChange={(e) => setFormData({...formData, prod_name: e.target.value})} placeholder="Product Name" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} placeholder="Category" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} placeholder="Brand (optional)" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
            <input value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} type="number" min="0" step="0.01" placeholder="Price" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            {showCosts && (
              <>
                <input value={formData.cost_price} onChange={(e) => setFormData({...formData, cost_price: e.target.value})} type="number" min="0" step="0.01" placeholder="Cost (admin only)" aria-label="Cost price" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                <input value={formData.supplier} onChange={(e) => setFormData({...formData, supplier: e.target.value})} placeholder="Supplier (admin only)" aria-label="Supplier" maxLength={120} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
              </>
            )}
            <input value={formData.stock_quantity} onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})} type="number" min="0" step="1" placeholder="Stock" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer transition ${
                isDragging
                  ? 'border-[#facc15] bg-[#facc15]/10 text-[#0b2e59] dark:text-yellow-200'
                  : 'border-gray-300 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a] text-gray-500 dark:text-slate-400 hover:border-[#0b2e59]'
              }`}
            >
              {uploading ? (
                <span className="inline-block w-4 h-4 border-2 border-[#0b2e59] border-t-transparent rounded-full animate-spin" />
              ) : (
                <BsUpload />
              )}
              <span className="text-xs">{uploading ? 'Uploading...' : isDragging ? 'Drop image here' : 'Drag & drop or click'}</span>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleFileUpload(e.target.files[0])} className="hidden" />
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Or paste image URL..."
              className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59]"
            />
            <button type="button" onClick={handleUrlUpload} disabled={uploading || !urlInput.trim()} className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] disabled:opacity-30 disabled:cursor-not-allowed transition">
              Fetch
            </button>
          </div>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Description (optional, shown on the product page)"
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59] resize-y"
          />
          <details className="rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a]/40 p-3">
            <summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
              Product information (optional)
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
              Leave a section blank to hide it. Start a line with &quot;- &quot; for a bullet; separate table
              cells with &quot; | &quot; (the first row becomes the header row).
            </p>
            <div className="mt-3 space-y-3">
              {SECTION_LABELS.map((label, i) => (
                <div key={label}>
                  <label htmlFor={`product-info-desktop-${i}`} className="mb-1 block text-xs font-semibold text-gray-700 dark:text-slate-300">
                    {label}
                  </label>
                  <textarea
                    id={`product-info-desktop-${i}`}
                    value={formData.details?.[label] || ''}
                    onChange={(e) => setFormData({ ...formData, details: { ...formData.details, [label]: e.target.value } })}
                    rows={3}
                    maxLength={4000}
                    placeholder={`${label} (optional)`}
                    className="w-full resize-y rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-[#0b2e59] focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </details>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">Visibility</span>
            <div className="flex gap-1.5">
              {[{ value: true, label: 'Active' }, { value: false, label: 'Hidden' }].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: opt.value })}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
                    formData.is_active === opt.value
                      ? 'bg-[#0b2e59] text-white'
                      : 'bg-white dark:bg-[#162d4a] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] border border-gray-200 dark:border-[#1e3a5f]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {formData.image_url && (
            <div className="flex items-center gap-3">
              <img src={formData.image_url} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-[#1e3a5f]" />
              <button type="button" onClick={() => setFormData((f) => ({ ...f, image_url: '' }))} className="text-xs text-red-500 hover:text-red-600 font-black uppercase tracking-widest">Remove</button>
            </div>
          )}
          <button type="submit" disabled={uploading || submitting} className={`${btnPrimary} w-full disabled:opacity-50`}>
            {submitting ? 'Saving...' : editing ? 'Update Product' : (uploading ? 'Processing...' : 'Save Product')}
          </button>
        </form>
      )}

      {error && !loading ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Products unavailable"
          message={error}
          action={
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0b2e59] dark:bg-yellow-500 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-400 transition min-h-[44px]"
            >
              <BsArrowClockwise className="w-3.5 h-3.5" /> Retry
            </button>
          }
        />
      ) : (
      <>
      <div className="flex flex-wrap gap-2 mb-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={`sk-chip-${i}`} className="h-7 w-20 rounded-lg bg-gray-200 dark:bg-[#162d4a] animate-pulse" aria-hidden="true" />
            ))
          : categories.map((c) => (
          <button
            key={c}
            onClick={() => { setCategoryFilter(c); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
              categoryFilter === c
                ? 'bg-[#0b2e59] text-white'
                : 'bg-white dark:bg-[#162d4a] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] border border-gray-200 dark:border-[#1e3a5f]'
            }`}
          >
            {c}
          </button>
        ))}
        {!loading && (
          <button
            onClick={() => { setShowArchived((v) => !v); setCategoryFilter('All'); setPage(1); }}
            aria-pressed={showArchived}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition ml-auto ${
              showArchived
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-[#162d4a] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] border border-gray-200 dark:border-[#1e3a5f]'
            }`}
          >
            Archived ({archivedItems.length})
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Min Price</label>
          <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="0"
            className="px-3 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm w-28 focus:outline-none focus:border-[#0b2e59]" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Max Price</label>
          <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="999999"
            className="px-3 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm w-28 focus:outline-none focus:border-[#0b2e59]" />
        </div>
        {(priceMin !== '' || priceMax !== '') && (
          <button onClick={() => { setPriceMin(''); setPriceMax(''); }} className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-gray-100 dark:bg-[#162d4a] hover:bg-gray-200 dark:hover:bg-[#1e3a5f] text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-[#1e3a5f]">Clear</button>
        )}
      </div>

      <AdminTable
        columns={columns}
        rows={displayed}
        rowKey={(p) => p.prod_id}
        loading={loading}
        colSpan={showCosts ? 9 : 7}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        renderMobileCard={(item) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-[#162d4a] overflow-hidden flex items-center justify-center shrink-0">
                {item.image_url
                  ? <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : <span className="text-[8px] text-gray-400">N/A</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{item.prod_name}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  PHP {formatPesos(Number(item.price || 0))}
                  <span className="ml-1.5">· {item.category} · Stock {item.stock_quantity}</span>
                </div>
                {showCosts && item.cost_price != null && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Cost PHP {formatPesos(Number(item.cost_price))} · Margin {formatMargin(item.price, item.cost_price)}
                  </div>
                )}
              </div>
              <StatusPill kind={productBadge(item).kind}>
                {productBadge(item).label}
              </StatusPill>
            </div>
            <div className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-gray-50 dark:border-[#1e3a5f]/40">
              <button onClick={() => openMobileEdit(item)} className="px-2 py-1 rounded bg-yellow-400 text-black text-[10px] font-bold">Edit</button>
              <button onClick={() => adjustStock(item, -1)} className="px-2 py-1 rounded bg-gray-100 dark:bg-[#162d4a] text-gray-700 dark:text-slate-300 text-[10px] font-bold">−1</button>
              <button onClick={() => adjustStock(item, +1)} className="px-2 py-1 rounded bg-gray-100 dark:bg-[#162d4a] text-gray-700 dark:text-slate-300 text-[10px] font-bold">+1</button>
              <button onClick={() => loadHistory(item)} className="px-2 py-1 rounded bg-gray-100 dark:bg-[#162d4a] text-gray-700 dark:text-slate-300 text-[10px] font-bold">History</button>
              {canLifecycle && (
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => toggleArchive(item)} className={`px-2 py-1 rounded text-[10px] font-bold text-white ${item.archived_at ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
                    {item.archived_at ? 'Restore' : 'Archive'}
                  </button>
                  <button onClick={() => setDeleteTarget(item)} className="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold">Delete</button>
                </div>
              )}
            </div>
          </div>
        )}
        empty={
          (search || categoryFilter !== 'All' || priceMin !== '' || priceMax !== '') ? (
            <EmptyState
              icon={<BsSearch />}
              title="No products match your filters"
              message="Try a different search term or clear the filters to see the full catalog."
              action={
                <button
                  type="button"
                  onClick={() => { setSearch(''); setCategoryFilter('All'); setPriceMin(''); setPriceMax(''); setPage(1); }}
                  className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] dark:bg-yellow-500 text-white dark:text-gray-900 hover:bg-[#15407a] dark:hover:bg-yellow-400 transition"
                >
                  Clear filters
                </button>
              }
            />
          ) : showArchived ? (
            <EmptyState
              icon={<BsArchive />}
              title="No archived products"
              message="Archived products are hidden from the store but keep their order history. Use Archive on any product to retire it here."
            />
          ) : (
            <EmptyState
              icon={<BsBoxSeam />}
              title="No products yet"
              message="Create your first product to make it available in the store."
            />
          )
        }
      />
      </>
      )}

      {/* Mobile Edit Dialog */}
      {mobileEditItem && (
        <dialog className="modal modal-open" aria-label="Edit Product">
          <div className="modal-box max-w-md bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Edit Product</h3>
              <button onClick={() => setMobileEditItem(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none">&times;</button>
            </div>
            <form onSubmit={handleMobileSubmit} className="p-4 space-y-3">
              <input value={mobileForm.prod_name} onChange={(e) => setMobileForm({...mobileForm, prod_name: e.target.value})} placeholder="Product Name" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
              <input value={mobileForm.category} onChange={(e) => setMobileForm({...mobileForm, category: e.target.value})} placeholder="Category" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
              <input value={mobileForm.brand} onChange={(e) => setMobileForm({...mobileForm, brand: e.target.value})} placeholder="Brand (optional)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
              <div className="grid grid-cols-2 gap-3">
                <input value={mobileForm.price} onChange={(e) => setMobileForm({...mobileForm, price: e.target.value})} type="number" min="0" step="0.01" placeholder="Price" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
                <input value={mobileForm.stock_quantity} onChange={(e) => setMobileForm({...mobileForm, stock_quantity: e.target.value})} type="number" min="0" step="1" placeholder="Stock" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
              </div>
              {showCosts && (
                <div className="grid grid-cols-2 gap-3">
                  <input value={mobileForm.cost_price} onChange={(e) => setMobileForm({...mobileForm, cost_price: e.target.value})} type="number" min="0" step="0.01" placeholder="Cost (admin)" aria-label="Cost price" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                  <input value={mobileForm.supplier} onChange={(e) => setMobileForm({...mobileForm, supplier: e.target.value})} placeholder="Supplier (admin)" aria-label="Supplier" maxLength={120} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                </div>
              )}
              <div
                onClick={() => mobileFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setMobileDragging(true); }}
                onDragLeave={() => setMobileDragging(false)}
                onDrop={(e) => { e.preventDefault(); setMobileDragging(false); if (e.dataTransfer.files[0]) handleMobileUpload(e.dataTransfer.files[0]); }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer transition ${
                  mobileDragging
                    ? 'border-[#facc15] bg-[#facc15]/10 text-[#0b2e59] dark:text-yellow-200'
                    : 'border-gray-300 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a] text-gray-500 dark:text-slate-400 hover:border-[#0b2e59]'
                }`}
              >
                {mobileUploading ? (
                  <span className="inline-block w-4 h-4 border-2 border-[#0b2e59] border-t-transparent rounded-full animate-spin" />
                ) : <BsUpload />}
                <span className="text-xs">{mobileUploading ? 'Uploading...' : 'Upload image'}</span>
                <input ref={mobileFileRef} type="file" accept="image/*" onChange={(e) => handleMobileUpload(e.target.files[0])} className="hidden" />
              </div>
              <div className="flex gap-2">
                <input value={mobileUrlInput} onChange={(e) => setMobileUrlInput(e.target.value)} placeholder="Or paste image URL..." className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                <button type="button" onClick={handleMobileUrlUpload} disabled={mobileUploading || !mobileUrlInput.trim()} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] disabled:opacity-30 disabled:cursor-not-allowed transition">Fetch</button>
              </div>
              <textarea
                value={mobileForm.description}
                onChange={(e) => setMobileForm({ ...mobileForm, description: e.target.value })}
                placeholder="Description (optional)"
                rows={3}
                maxLength={2000}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59] resize-y"
              />
              <details className="rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a]/40 p-3">
                <summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
                  Product information (optional)
                </summary>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
                  Leave a section blank to hide it. Start a line with &quot;- &quot; for a bullet; separate
                  table cells with &quot; | &quot; (the first row becomes the header row).
                </p>
                <div className="mt-3 space-y-3">
                  {SECTION_LABELS.map((label, i) => (
                    <div key={label}>
                      <label htmlFor={`product-info-mobile-${i}`} className="mb-1 block text-xs font-semibold text-gray-700 dark:text-slate-300">
                        {label}
                      </label>
                      <textarea
                        id={`product-info-mobile-${i}`}
                        value={mobileForm.details?.[label] || ''}
                        onChange={(e) => setMobileForm({ ...mobileForm, details: { ...mobileForm.details, [label]: e.target.value } })}
                        rows={3}
                        maxLength={4000}
                        placeholder={`${label} (optional)`}
                        className="w-full resize-y rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-[#0b2e59] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </details>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">Visibility</span>
                <div className="flex gap-1.5">
                  {[{ value: true, label: 'Active' }, { value: false, label: 'Hidden' }].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setMobileForm({ ...mobileForm, is_active: opt.value })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
                        mobileForm.is_active === opt.value
                          ? 'bg-[#0b2e59] text-white'
                          : 'bg-white dark:bg-[#162d4a] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] border border-gray-200 dark:border-[#1e3a5f]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {mobileForm.image_url && (
                <div className="flex items-center gap-3">
                  <img src={mobileForm.image_url} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-[#1e3a5f]" />
                  <button type="button" onClick={() => setMobileForm((f) => ({ ...f, image_url: '' }))} className="text-[10px] text-red-500 hover:text-red-600 font-black uppercase tracking-widest">Remove</button>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setMobileEditItem(null)} className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition">Cancel</button>
                <button type="submit" disabled={mobileUploading || mobileSubmitting} className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] text-white hover:bg-[#1a4275] disabled:opacity-50 transition">{mobileSubmitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setMobileEditItem(null)}>close</button></form>
        </dialog>
      )}

      {/* Price History Dialog */}
      {historyTarget && (
        <dialog className="modal modal-open" aria-label="Price History">
          <div className="modal-box max-w-md bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Price History</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{historyTarget.prod_name}</p>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none" aria-label="Close">&times;</button>
            </div>
            <div className="p-4">
              {historyRows === null && !historyError && (
                <div className="space-y-2" aria-live="polite">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-[#162d4a] animate-pulse" aria-hidden="true" />
                  ))}
                </div>
              )}
              {historyError && (
                <div className="text-sm">
                  <p className="text-red-600 dark:text-red-400 mb-3" role="alert">{historyError}</p>
                  <button
                    type="button"
                    onClick={() => loadHistory(historyTarget)}
                    className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] dark:bg-yellow-500 text-white dark:text-gray-900 hover:bg-[#15407a] dark:hover:bg-yellow-400 transition"
                  >
                    Retry
                  </button>
                </div>
              )}
              {historyRows !== null && !historyError && historyRows.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-slate-400">No price changes recorded yet.</p>
              )}
              {historyRows !== null && !historyError && historyRows.length > 0 && (
                <ul className="divide-y divide-gray-100 dark:divide-[#1e3a5f]/50">
                  {historyRows.map((row, i) => (
                    <li key={`${row.created_at}-${i}`} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 dark:text-slate-100">
                          {row.old_price != null
                            ? <>PHP {formatPesos(Number(row.old_price))} <span className="text-gray-400 dark:text-slate-500">→</span> PHP {formatPesos(Number(row.new_price))}</>
                            : <>First listed at PHP {formatPesos(Number(row.new_price))}</>}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                          {row.changed_by || 'Unknown user'}
                        </div>
                      </div>
                      <time className="text-[11px] text-gray-400 dark:text-slate-500 whitespace-nowrap" dateTime={row.created_at}>
                        {new Date(row.created_at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setHistoryTarget(null)}>close</button></form>
        </dialog>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.prod_name}"? This action cannot be undone.`}
        confirmLabel="Delete Product"
        cancelLabel="Keep Product"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPage>
  );
};

export default AdminProductManagement;
