import React, { useState, useEffect, useMemo, useRef } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth, apiUploadAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, btnPrimary, StatusPill, ConfirmDialog } from './adminTheme';
import { BsBoxSeam, BsPencilSquare, BsTrash, BsUpload, BsSearch } from 'react-icons/bs';
import toast from 'react-hot-toast';

const AdminProductManagement = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ prod_name: '', category: '', price: '', stock_quantity: '', image_url: '' });
  const [sortKey, setSortKey] = useState('prod_name');
  const [sortDir, setSortDir] = useState('asc');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef(null);
  const PAGE_SIZE = 10;

  useEffect(() => { fetchProducts(); }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchProducts() {
    setLoading(true);
    try {
      const token = await getToken(); if (!token) return;
      const { items } = await apiGetAuth('/admin/products', token);
      setProducts(items || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  function startEdit(item) {
    setEditing(item.prod_id);
    setFormData({
      prod_name: item.prod_name || '',
      category: item.category || '',
      price: String(item.price ?? ''),
      stock_quantity: String(item.stock_quantity ?? ''),
      image_url: item.image_url || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditing(null);
    setFormData({ prod_name: '', category: '', price: '', stock_quantity: '', image_url: '' });
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
    try {
      const token = await getToken(); if (!token) return;
      const payload = {
        prod_name: formData.prod_name,
        category: formData.category,
        price: Number(formData.price),
        stock_quantity: Number(formData.stock_quantity),
        image_url: formData.image_url,
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
  };

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const token = await getToken(); if (!token) return;
      await apiDeleteAuth(`/admin/products/${deleteTarget.prod_id}`, token);
      setProducts((prev) => prev.filter((p) => p.prod_id !== deleteTarget.prod_id));
      toast.success('Product deleted');
    } catch (err) { toast.error(err.message); }
    finally { setDeleteTarget(null); }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
    return ['All', ...cats];
  }, [products]);

  const displayed = useMemo(() => {
    let list = [...products];
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
  }, [products, sortKey, sortDir, priceMin, priceMax, search, categoryFilter]);

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
    { key: 'price', label: 'Price', sortable: true, render: (item) => <span className="font-black text-[#0b2e59] dark:text-yellow-200">PHP {Number(item.price || 0).toLocaleString()}</span> },
    { key: 'stock_quantity', label: 'Stock', sortable: true, render: (item) => <span className="text-gray-700 dark:text-slate-300">{item.stock_quantity}</span> },
    { key: 'status', label: 'Status', render: (item) => (
      <StatusPill kind={item.stock_quantity > 0 ? 'success' : 'danger'}>
        {item.stock_quantity > 0 ? 'Active' : 'Out'}
      </StatusPill>
    ) },
    { key: 'actions', label: 'Actions', render: (item) => (
      <div className="flex gap-1">
        <button onClick={() => startEdit(item)} className="p-1.5 rounded bg-[#facc15] hover:bg-[#fde047] text-black"><BsPencilSquare /></button>
        <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white"><BsTrash /></button>
      </div>
    ) },
  ];

  return (
    <AdminPage title="Product Management" subtitle="Curate the items shoppers can buy.">

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }} className={btnPrimary}>
          {showForm ? 'Cancel' : '+ New Product'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-5 rounded-xl border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0f2137] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <input value={formData.prod_name} onChange={(e) => setFormData({...formData, prod_name: e.target.value})} placeholder="Product Name" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} placeholder="Category" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} type="number" placeholder="Price" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
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
          {formData.image_url && (
            <div className="flex items-center gap-3">
              <img src={formData.image_url} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-[#1e3a5f]" />
              <button type="button" onClick={() => setFormData((f) => ({ ...f, image_url: '' }))} className="text-xs text-red-500 hover:text-red-600 font-black uppercase tracking-widest">Remove</button>
            </div>
          )}
          <button type="submit" disabled={uploading} className={`${btnPrimary} w-full disabled:opacity-50`}>
            {editing ? 'Update Product' : (uploading ? 'Processing...' : 'Save Product')}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((c) => (
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
        colSpan={7}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        empty={
          <EmptyState
            icon={<BsBoxSeam />}
            title="No products yet"
            message="Create your first product to make it available in the store."
          />
        }
      />

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
