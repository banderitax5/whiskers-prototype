import React, { useState, useEffect, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, ErrorBanner, StatCard, btnPrimary, StatusPill } from './adminTheme';
import { BsBoxSeam, BsPlusLg, BsDashLg, BsTrash, BsUpload, BsPencilSquare } from 'react-icons/bs';

const AdminInventoryManagement = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ prod_name: '', category: '', price: '', stock_quantity: '', image_url: '' });
  const [sortKey, setSortKey] = useState('prod_name');
  const [sortDir, setSortDir] = useState('asc');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  useEffect(() => { fetchProducts(); }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchProducts() {
    setLoading(true); setError(null);
    try {
      const token = await getToken(); if (!token) return;
      const { items } = await apiGetAuth('/admin/products', token);
      setProducts(items || []);
    } catch (err) { setError(err.message); }
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

  const handleFileUpload = async (event) => {
    try {
      setUploading(true);
      const file = event.target.files[0]; if (!file) return;
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
      setFormData((f) => ({ ...f, image_url: data.publicUrl }));
    } catch (error) { alert('Error uploading image: ' + error.message); }
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
      } else {
        await apiPostAuth('/admin/products', payload, token);
      }
      resetForm(); setShowForm(false); await fetchProducts();
    } catch (error) { alert(error.message); }
  };

  async function adjustStock(item, delta) {
    const next = Math.max(0, Number(item.stock_quantity || 0) + delta);
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/products/${item.prod_id}`, { stock_quantity: next }, token);
      setProducts((prev) => prev.map((p) => p.prod_id === item.prod_id ? { ...p, stock_quantity: next } : p));
    } catch (err) { alert(err.message); }
  }

  async function removeProduct(item) {
    if (!confirm(`Delete ${item.prod_name}?`)) return;
    try {
      const token = await getToken(); if (!token) return;
      await apiDeleteAuth(`/admin/products/${item.prod_id}`, token);
      setProducts((prev) => prev.filter((p) => p.prod_id !== item.prod_id));
    } catch (err) { alert(err.message); }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const displayed = useMemo(() => {
    let list = [...products];
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
  }, [products, sortKey, sortDir, priceMin, priceMax]);

  const totalProducts = products.length;
  const lowStockCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 10).length;
  const outOfStockCount = products.filter(p => p.stock_quantity <= 0).length;

  const columns = [
    { key: 'img', label: 'Image', render: (item) => (
      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
        {item.image_url
          ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-[10px] text-gray-400">N/A</span>}
      </div>
    ) },
    { key: 'prod_name', label: 'Product', sortable: true, render: (item) => <span className="font-bold text-gray-900">{item.prod_name}</span> },
    { key: 'category', label: 'Category', sortable: true, render: (item) => (
      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-[10px] font-black uppercase tracking-widest border border-gray-200">{item.category}</span>
    ) },
    { key: 'price', label: 'Price', sortable: true, render: (item) => <span className="font-black text-[#0b2e59]">PHP {Number(item.price || 0).toLocaleString()}</span> },
    { key: 'stock_quantity', label: 'Stock', sortable: true, render: (item) => <span className="text-gray-700">{item.stock_quantity}</span> },
    { key: 'status', label: 'Status', render: (item) => {
      const kind = item.stock_quantity <= 0 ? 'danger' : item.stock_quantity <= 10 ? 'progress' : 'success';
      const label = item.stock_quantity <= 0 ? 'Out of Stock' : item.stock_quantity <= 10 ? 'Low Stock' : 'In Stock';
      return <StatusPill kind={kind}>{label}</StatusPill>;
    } },
    { key: 'actions', label: 'Actions', render: (item) => (
      <div className="flex items-center gap-1">
        <button onClick={() => startEdit(item)} className="p-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white" title="Edit"><BsPencilSquare /></button>
        <button onClick={() => adjustStock(item, -1)} className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700" title="Decrease stock"><BsDashLg /></button>
        <button onClick={() => adjustStock(item, +1)} className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700" title="Increase stock"><BsPlusLg /></button>
        <button onClick={() => removeProduct(item)} className="p-1.5 rounded bg-red-500 hover:bg-red-600 text-white" title="Delete"><BsTrash /></button>
      </div>
    ) },
  ];

  return (
    <AdminPage title="Inventory Management" subtitle="Stock levels and availability at a glance.">
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Products" value={totalProducts} />
        <StatCard label="Low Stock" value={lowStockCount} />
        <StatCard label="Out of Stock" value={outOfStockCount} />
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }} className={btnPrimary}>
          {showForm ? 'Cancel' : '+ Add New Product'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-5 rounded-xl border border-gray-200 bg-white space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <input value={formData.prod_name} onChange={(e) => setFormData({...formData, prod_name: e.target.value})} placeholder="Product Name" className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} placeholder="Category" className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} type="number" placeholder="Price" className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0b2e59]" required />
            <input value={formData.stock_quantity} onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})} type="number" placeholder="Stock" className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0b2e59]" required />
            <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-dashed border-gray-300 text-gray-500 cursor-pointer hover:border-[#0b2e59]">
              <BsUpload /> {uploading ? 'Uploading...' : 'Upload Image'}
              <input type="file" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <button type="submit" disabled={uploading} className={`${btnPrimary} w-full disabled:opacity-50`}>
            {editing ? 'Update Product' : (uploading ? 'Processing...' : 'Save Product')}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Min Price</label>
          <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="0"
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 text-sm w-28 focus:outline-none focus:border-[#0b2e59]" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Max Price</label>
          <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="999999"
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 text-sm w-28 focus:outline-none focus:border-[#0b2e59]" />
        </div>
        {(priceMin !== '' || priceMax !== '') && (
          <button onClick={() => { setPriceMin(''); setPriceMax(''); }} className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200">Clear</button>
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
        empty={
          <EmptyState
            icon={<BsBoxSeam />}
            title="No products in inventory"
            message="Add your first product using the button above to start tracking stock."
          />
        }
      />
    </AdminPage>
  );
};

export default AdminInventoryManagement;
