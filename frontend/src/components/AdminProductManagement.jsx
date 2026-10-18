import React, { useState, useEffect, useMemo, useRef } from 'react';
import supabase from '../lib/supabase';
import { apiGet, apiGetAuth, apiPostAuth, apiPatchAuth, apiDeleteAuth, apiUploadAuth, apiFetchAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, btnPrimary, StatusPill, ConfirmDialog, AdminSelect } from './adminTheme';
import { sectionsForEdit, sectionsToDetails, MAX_SECTIONS } from '../lib/productInfo';
import { parseCsv, csvToProducts, batchRows, importTemplateCsv } from '../lib/productCsv';
import { formatPesos } from '../lib/cartLogic';
import { formatMargin } from '../lib/adminCosting';
import { useRole } from '../context/RoleContext';
import { canSeeCosts, canManageProductLifecycle, canEditPrice } from '../lib/permissions';
import { fetchSiteContent, contentSettings } from '../lib/siteContent.js';
import { useSelection, RowCheckBox, SelectionBar, SelectAllRow, LongPressBox, bulkApply, bulkSummary, barBtnPlain, barBtnAccent, barBtnDanger } from './adminBulk';
import { BsBoxSeam, BsPlusLg, BsDashLg, BsPencilSquare, BsTrash, BsUpload, BsSearch, BsExclamationTriangle, BsArrowClockwise, BsArchive, BsArrowCounterclockwise, BsClockHistory, BsFiles, BsDownload, BsQuestionCircle } from 'react-icons/bs';
import toast from 'react-hot-toast';

// form-field label style shared by the desktop and mobile product forms -
// placeholders alone vanish once a field has a value, which made the filled
// price/cost/stock boxes unreadable
const FIELD_LABEL = 'block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400';

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
  const canPrice = canEditPrice(role);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingOriginal, setEditingOriginal] = useState(null);
  const [formData, setFormData] = useState({ prod_name: '', category: '', brand: '', price: '', stock_quantity: '0', is_active: true, image_url: '', description: '', details: sectionsForEdit(null), cost_price: '', supplier: '' });
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
  const [mobileForm, setMobileForm] = useState({ prod_name: '', category: '', brand: '', price: '', stock_quantity: '0', is_active: true, image_url: '', description: '', details: sectionsForEdit(null), cost_price: '', supplier: '' });
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
  // owner-editable threshold: low stock comes from the public site-content
  // payload (staff + admin)
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  // category dropdown options: public active categories plus whatever the
  // loaded admin list contains (hidden / archived products keep their labels)
  const [categoryList, setCategoryList] = useState([]);
  // CSV import/export + help
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // bulk actions over the selection
  const sel = useSelection();
  const [bulkDialog, setBulkDialog] = useState(null); // 'category' | 'price' | 'archive'
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const fileInputRef = useRef(null);
  const mobileFileRef = useRef(null);
  const importFileRef = useRef(null);
  const PAGE_SIZE = 10;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProducts(); }, [reloadKey]);

  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((content) => {
      if (cancelled || !content) return
      const t = Number(contentSettings(content).low_stock_threshold)
      if (Number.isFinite(t) && t >= 0) setLowStockThreshold(t)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { fetchCategoryList() }, [])

  // drop selected ids that no longer exist (deleted or restored away)
  const pruneSel = sel.prune;
  useEffect(() => { pruneSel(products.map((p) => p.prod_id)) }, [products, pruneSel]);

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

  async function fetchCategoryList() {
    try {
      const data = await apiGet('/products/categories');
      setCategoryList(data.items || []);
    } catch { /* non-fatal: product-derived categories still populate the list */ }
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
      details: sectionsForEdit(item.details),
      cost_price: item.cost_price != null ? String(item.cost_price) : '',
      supplier: item.supplier || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditing(null);
    setEditingOriginal(null);
    setFormData({ prod_name: '', category: '', brand: '', price: '', stock_quantity: '0', is_active: true, image_url: '', description: '', details: sectionsForEdit(null), cost_price: '', supplier: '' });
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
    if ((formData.details || []).some((s) => (s.content || '').trim() && !(s.label || '').trim())) {
      toast.error('Give each filled product-information section a heading');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken(); if (!token) return;
      const payload = {
        prod_name: formData.prod_name.trim(),
        category: formData.category.trim(),
        brand: formData.brand?.trim() || null,
        // staff never send a price: the server 403s the field outright
        ...(canPrice ? { price } : {}),
        stock_quantity: stock,
        is_active: formData.is_active,
        image_url: formData.image_url,
        description: formData.description || null,
        details: sectionsToDetails(formData.details),
        ...costPatchFields(formData, editingOriginal, showCosts),
      };
      if (editing) {
        await apiPatchAuth(`/admin/products/${editing}`, payload, token);
        toast.success('Product updated');
      } else {
        await apiPostAuth('/admin/products', payload, token);
        toast.success('Product created');
      }
      resetForm(); setShowForm(false); await fetchProducts(); fetchCategoryList();
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

  // one-click copy: same fields, name gets " (copy)", starts Hidden so the
  // owner reviews before it goes live. Retries numbered copies on a name clash.
  async function duplicateProduct(item) {
    if (duplicatingId) return;
    setDuplicatingId(item.prod_id);
    try {
      const token = await getToken(); if (!token) return;
      const base = {
        category: item.category,
        brand: item.brand ?? null,
        price: item.price,
        stock_quantity: item.stock_quantity,
        is_active: false,
        image_url: item.image_url ?? null,
        description: item.description ?? null,
        details: item.details ?? null,
      };
      if (showCosts) {
        if (item.cost_price != null) base.cost_price = Number(item.cost_price);
        if (item.supplier) base.supplier = item.supplier;
      }
      let created = null;
      for (let n = 1; n <= 9 && !created; n++) {
        const prod_name = n === 1 ? `${item.prod_name} (copy)` : `${item.prod_name} (copy ${n})`;
        try {
          const res = await apiPostAuth('/admin/products', { ...base, prod_name }, token);
          created = res.item;
        } catch (err) {
          if (!/already exists/i.test(err?.message || '') || n === 9) throw err;
        }
      }
      if (!created) throw new Error('Could not find a free name for the copy');
      toast.success('Copied as Hidden - review it, then set Active.');
      await fetchProducts(); fetchCategoryList();
      startEdit(created);
    } catch (err) {
      toast.error(err.message || 'Could not copy product');
    } finally { setDuplicatingId(null); }
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const token = await getToken(); if (!token) return;
      const res = await apiFetchAuth('/admin/products/export', token);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whiskers-products-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally { setExporting(false); }
  }

  async function handleImportFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      const result = csvToProducts(parsed);
      setImportPreview({ ...result, fileName: file.name });
      setImportResult(null);
    } catch {
      setImportPreview({ rows: [], errors: [{ row: 0, message: 'Could not read that file' }], updateCount: 0, newCount: 0, fileName: file.name });
    }
  }

  async function runImport() {
    if (!importPreview?.rows?.length || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const token = await getToken(); if (!token) return;
      const batches = batchRows(importPreview.rows);
      let created = 0;
      let updated = 0;
      const errors = [];
      let offset = 0;
      for (const batch of batches) {
        const res = await apiPostAuth('/admin/products/import', { rows: batch }, token);
        created += res.created || 0;
        updated += res.updated || 0;
        for (const e of res.errors || []) errors.push({ row: e.row + offset, message: e.message });
        offset += batch.length;
      }
      setImportResult({ created, updated, errors });
      await fetchProducts(); fetchCategoryList();
    } catch (err) {
      toast.error(err.message || 'Import failed');
    } finally { setImporting(false); }
  }

  // bulk PATCH over the selected ids; one failure never hides the successes
  async function runBulkPatch(makeBody, successVerb) {
    const ids = [...sel.selected];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const token = await getToken(); if (!token) return;
      const res = await bulkApply(ids, (id) => apiPatchAuth(`/admin/products/${id}`, makeBody(id), token));
      if (res.fail.length) toast.error(bulkSummary(successVerb, res, 'product'));
      else toast.success(bulkSummary(successVerb, res, 'product'));
      sel.clear();
      setBulkDialog(null);
      await fetchProducts();
    } catch (err) {
      toast.error(err.message);
    } finally { setBulkBusy(false); }
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
      details: sectionsForEdit(item.details),
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
    if ((mobileForm.details || []).some((s) => (s.content || '').trim() && !(s.label || '').trim())) {
      toast.error('Give each filled product-information section a heading');
      return;
    }
    setMobileSubmitting(true);
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/products/${mobileEditItem.prod_id}`, {
        prod_name: mobileForm.prod_name.trim(),
        category: mobileForm.category.trim(),
        brand: mobileForm.brand?.trim() || null,
        ...(canPrice ? { price } : {}),
        stock_quantity: stock,
        is_active: mobileForm.is_active,
        image_url: mobileForm.image_url,
        description: mobileForm.description || null,
        details: sectionsToDetails(mobileForm.details),
        ...costPatchFields(mobileForm, mobileEditItem, showCosts),
      }, token);
      toast.success('Product updated');
      setMobileEditItem(null);
      await fetchProducts(); fetchCategoryList();
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

  // dropdown options for the form(s): public active categories union every
  // category present on the loaded admin list (hidden/archived included)
  const categoryOptions = useMemo(() => {
    const set = new Set(categoryList);
    for (const p of products) if (p.category) set.add(p.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categoryList, products]);

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
  const lowStockCount = catalogList.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= lowStockThreshold).length;
  const outOfStockCount = catalogList.filter((p) => p.stock_quantity <= 0).length;

  // rows currently on screen - the scope of "select all" and the bulk bar
  const displayedIds = useMemo(() => displayed.map((p) => p.prod_id), [displayed]);

  // margin cell tone: green when profitable, red when losing money, gray when
  // there is no meaningful number (no cost yet, or no selling price)
  function marginTone(price, cost) {
    const margin = formatMargin(price, cost);
    if (margin === '—') return 'text-gray-400 dark:text-slate-500';
    if (margin.startsWith('-')) return 'text-red-600 dark:text-red-400';
    return 'text-emerald-600 dark:text-emerald-400';
  }

  // ARCHIVED beats HIDDEN beats OUT beats ACTIVE — the badge rules
  function productBadge(item) {
    if (item.archived_at) return { kind: 'info', label: 'Archived' };
    if (item.is_active === false) return { kind: 'neutral', label: 'Hidden' };
    if (Number(item.stock_quantity || 0) <= 0) return { kind: 'danger', label: 'Out' };
    return { kind: 'success', label: 'Active' };
  }

  const columns = [
    { key: 'select', label: (
      <input
        type="checkbox"
        checked={displayedIds.length > 0 && displayedIds.every((id) => sel.isSelected(id))}
        ref={(el) => { if (el) el.indeterminate = displayedIds.some((id) => sel.isSelected(id)) && !displayedIds.every((id) => sel.isSelected(id)) }}
        onChange={() => {
          const allOn = displayedIds.length > 0 && displayedIds.every((id) => sel.isSelected(id));
          if (allOn) sel.deselect(displayedIds);
          else sel.selectAdd(displayedIds);
        }}
        aria-label="Select all products in view"
        className="h-4 w-4 rounded border-gray-300 dark:border-[#2c4a6f] accent-[#0b2e59] dark:accent-yellow-400"
      />
    ), className: 'w-10', render: (item) => (
      <RowCheckBox
        checked={sel.isSelected(item.prod_id)}
        onChange={() => sel.toggle(item.prod_id)}
        label={`Select ${item.prod_name}`}
      />
    ) },
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
      { key: 'margin', label: 'Margin', render: (item) => (
        <span className={`font-black ${marginTone(item.price, item.cost_price)}`}>{formatMargin(item.price, item.cost_price)}</span>
      ) },
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
          <button
            onClick={() => duplicateProduct(item)}
            disabled={duplicatingId === item.prod_id}
            className="p-1.5 rounded bg-gray-100 dark:bg-[#162d4a] hover:bg-gray-200 dark:hover:bg-[#1e3a5f] text-gray-700 dark:text-slate-300 disabled:opacity-40"
            title="Duplicate product (copies everything, saved as Hidden)"
          >
            {duplicatingId === item.prod_id ? <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <BsFiles />}
          </button>
        )}
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
            <div>
              <label htmlFor="product-name-desktop" className={FIELD_LABEL}>Product name <span className="text-red-500">*</span></label>
              <input id="product-name-desktop" value={formData.prod_name} onChange={(e) => setFormData({...formData, prod_name: e.target.value})} placeholder="Exactly what shoppers will see" title="Exactly what shoppers will see" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            </div>
            <div>
              <label htmlFor="product-category-desktop" className={FIELD_LABEL}>Category <span className="text-red-500">*</span></label>
              <CategoryField
                id="product-category-desktop"
                value={formData.category}
                options={categoryOptions}
                onChange={(category) => setFormData({ ...formData, category })}
                className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 focus:outline-none focus:border-[#0b2e59]"
              />
            </div>
            <div>
              <label htmlFor="product-brand-desktop" className={FIELD_LABEL}>Brand (optional)</label>
              <input id="product-brand-desktop" value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} placeholder="Shown on the product page" title="Shown on the product page" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
            </div>
            <div>
              <label htmlFor="product-price-desktop" className={FIELD_LABEL}>Price (₱) <span className="text-red-500">*</span></label>
              <input id="product-price-desktop" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} type="number" min="0" step="0.01" placeholder="0.00" title={canPrice ? "Selling price in pesos" : "Only the admin can change the price"} aria-label="Price" disabled={!canPrice} className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59] disabled:opacity-60" required />
              {!canPrice && (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">Selling price is managed by the admin.</p>
              )}
              {formData.price !== '' && Number(formData.price) === 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400" role="status">
                  Price is 0 - shoppers will see &quot;Price not yet set&quot; and cannot buy this product.
                </p>
              )}
            </div>
            {showCosts && (
              <>
                <div>
                  <label htmlFor="product-cost-desktop" className={FIELD_LABEL}>Cost (₱, admin only)</label>
                  <input id="product-cost-desktop" value={formData.cost_price} onChange={(e) => setFormData({...formData, cost_price: e.target.value})} type="number" min="0" step="0.01" placeholder="0.00" aria-label="Cost price" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                </div>
                <div>
                  <label htmlFor="product-supplier-desktop" className={FIELD_LABEL}>Supplier (admin only)</label>
                  <input id="product-supplier-desktop" value={formData.supplier} onChange={(e) => setFormData({...formData, supplier: e.target.value})} placeholder="Who you buy it from" aria-label="Supplier" maxLength={120} className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                </div>
              </>
            )}
            <div>
              <label htmlFor="product-stock-desktop" className={FIELD_LABEL}>Stock quantity <span className="text-red-500">*</span></label>
              <input id="product-stock-desktop" value={formData.stock_quantity} onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})} type="number" min="0" step="1" placeholder="How many you have" title="How many you have; 0 shows as out of stock" aria-label="Stock quantity" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
            </div>
            <div>
              <label htmlFor="product-image-desktop" className={FIELD_LABEL}>Product image</label>
              <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`mt-1.5 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer transition ${
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
              <input ref={fileInputRef} id="product-image-desktop" type="file" accept="image/*" onChange={(e) => handleFileUpload(e.target.files[0])} className="hidden" />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="product-image-url-desktop" className={FIELD_LABEL}>Or paste an image URL</label>
            <div className="mt-1.5 flex gap-2">
            <input
              id="product-image-url-desktop"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59]"
            />
              <button type="button" onClick={handleUrlUpload} disabled={uploading || !urlInput.trim()} className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] disabled:opacity-30 disabled:cursor-not-allowed transition">
                Fetch
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="product-description-desktop" className={FIELD_LABEL}>Description (optional)</label>
            <textarea
              id="product-description-desktop"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Short sales blurb shown under the product title"
              title="Short sales blurb shown under the product title"
              rows={3}
              maxLength={2000}
              className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59] resize-y"
            />
          </div>
          <DetailsEditor
            idPrefix="product-info-desktop"
            sections={formData.details || []}
            onChange={(details) => setFormData({ ...formData, details })}
          />
          <div className="flex items-center gap-2" title="Hidden keeps the product out of the store without deleting it">
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canLifecycle && (
            <button
              onClick={() => { setImportOpen(true); setImportPreview(null); setImportResult(null); }}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-white dark:bg-[#162d4a] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-[#1e3a5f]"
              title="Upload a spreadsheet of products"
            >
              Import CSV
            </button>
          )}
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-white dark:bg-[#162d4a] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-[#1e3a5f] disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Download every product as a spreadsheet (a backup you can re-import)"
          >
            <BsDownload className="inline" /> {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="p-2 rounded-lg bg-white dark:bg-[#162d4a] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-[#1e3a5f]"
            title="How to manage products"
            aria-label="How to manage products"
          >
            <BsQuestionCircle />
          </button>
        </div>
      </div>

      <SelectAllRow
        allSelected={displayedIds.length > 0 && displayedIds.every((id) => sel.isSelected(id))}
        someSelected={displayedIds.some((id) => sel.isSelected(id))}
        onToggle={() => {
          const allOn = displayedIds.length > 0 && displayedIds.every((id) => sel.isSelected(id));
          if (allOn) sel.deselect(displayedIds);
          else sel.selectAdd(displayedIds);
        }}
        total={displayedIds.length}
        noun="product"
      />

      <SelectionBar count={sel.count} onClear={sel.clear}>
        <button type="button" className={barBtnAccent} onClick={() => { setBulkCategory(''); setBulkDialog('category'); }} disabled={bulkBusy}>
          Set category...
        </button>
        <button type="button" className={barBtnPlain} onClick={() => runBulkPatch(() => ({ is_active: false }), 'Set hidden')} disabled={bulkBusy}>
          Hide
        </button>
        <button type="button" className={barBtnPlain} onClick={() => runBulkPatch(() => ({ is_active: true }), 'Set shown')} disabled={bulkBusy}>
          Show
        </button>
        {canPrice && (
          <button type="button" className={barBtnAccent} onClick={() => { setBulkPrice(''); setBulkDialog('price'); }} disabled={bulkBusy}>
            Set price...
          </button>
        )}
        {canLifecycle && (
          <button type="button" className={barBtnDanger} onClick={() => setBulkDialog('archive')} disabled={bulkBusy}>
            Archive...
          </button>
        )}
      </SelectionBar>

      <AdminTable
        columns={columns}
        rows={displayed}
        rowKey={(p) => p.prod_id}
        loading={loading}
        colSpan={showCosts ? 10 : 8}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        renderMobileCard={(item) => (
          <LongPressBox onActivate={() => sel.toggle(item.prod_id)} className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <RowCheckBox
                checked={sel.isSelected(item.prod_id)}
                onChange={() => sel.toggle(item.prod_id)}
                label={`Select ${item.prod_name}`}
              />
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
                    Cost PHP {formatPesos(Number(item.cost_price))} · Margin{' '}
                    <span className={`font-semibold ${marginTone(item.price, item.cost_price)}`}>
                      {formatMargin(item.price, item.cost_price)}
                    </span>
                  </div>
                )}
              </div>
              <StatusPill kind={productBadge(item).kind}>
                {productBadge(item).label}
              </StatusPill>
            </div>
            <div className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-gray-50 dark:border-[#1e3a5f]/40">
              <button onClick={() => openMobileEdit(item)} className="px-2 py-1 rounded bg-yellow-400 text-black text-[10px] font-bold">Edit</button>
              {canLifecycle && (
                <button
                  onClick={() => duplicateProduct(item)}
                  disabled={duplicatingId === item.prod_id}
                  className="px-2 py-1 rounded bg-gray-100 dark:bg-[#162d4a] text-gray-700 dark:text-slate-300 text-[10px] font-bold disabled:opacity-40"
                >
                  {duplicatingId === item.prod_id ? '...' : 'Copy'}
                </button>
              )}
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
          </LongPressBox>
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
          <div className="modal-box max-w-md my-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Edit Product</h3>
              <button onClick={() => setMobileEditItem(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none">&times;</button>
            </div>
            <form onSubmit={handleMobileSubmit} className="p-4 space-y-3">
              <div>
                <label htmlFor="product-name-mobile" className={FIELD_LABEL}>Product name <span className="text-red-500">*</span></label>
                <input id="product-name-mobile" value={mobileForm.prod_name} onChange={(e) => setMobileForm({...mobileForm, prod_name: e.target.value})} placeholder="Exactly what shoppers will see" title="Exactly what shoppers will see" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
              </div>
              <div>
                <label htmlFor="product-category-mobile" className={FIELD_LABEL}>Category <span className="text-red-500">*</span></label>
                <CategoryField
                  id="product-category-mobile"
                  value={mobileForm.category}
                  options={categoryOptions}
                  onChange={(category) => setMobileForm({ ...mobileForm, category })}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#0b2e59]"
                />
              </div>
              <div>
                <label htmlFor="product-brand-mobile" className={FIELD_LABEL}>Brand (optional)</label>
                <input id="product-brand-mobile" value={mobileForm.brand} onChange={(e) => setMobileForm({...mobileForm, brand: e.target.value})} placeholder="Shown on the product page" title="Shown on the product page" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="product-price-mobile" className={FIELD_LABEL}>Price (₱) <span className="text-red-500">*</span></label>
                  <input id="product-price-mobile" value={mobileForm.price} onChange={(e) => setMobileForm({...mobileForm, price: e.target.value})} type="number" min="0" step="0.01" placeholder="0.00" title={canPrice ? "Selling price in pesos" : "Only the admin can change the price"} aria-label="Price" disabled={!canPrice} className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59] disabled:opacity-60" required />
                  {!canPrice && (
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-slate-400">Admin sets the price.</p>
                  )}
                  {mobileForm.price !== '' && Number(mobileForm.price) === 0 && (
                    <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400" role="status">
                      Price 0 - cannot be bought.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="product-stock-mobile" className={FIELD_LABEL}>Stock <span className="text-red-500">*</span></label>
                  <input id="product-stock-mobile" value={mobileForm.stock_quantity} onChange={(e) => setMobileForm({...mobileForm, stock_quantity: e.target.value})} type="number" min="0" step="1" placeholder="How many" title="How many you have; 0 shows as out of stock" aria-label="Stock quantity" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" required />
                </div>
              </div>
              {showCosts && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="product-cost-mobile" className={FIELD_LABEL}>Cost (₱, admin)</label>
                    <input id="product-cost-mobile" value={mobileForm.cost_price} onChange={(e) => setMobileForm({...mobileForm, cost_price: e.target.value})} type="number" min="0" step="0.01" placeholder="0.00" aria-label="Cost price" className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                  </div>
                  <div>
                    <label htmlFor="product-supplier-mobile" className={FIELD_LABEL}>Supplier (admin)</label>
                    <input id="product-supplier-mobile" value={mobileForm.supplier} onChange={(e) => setMobileForm({...mobileForm, supplier: e.target.value})} placeholder="Who you buy it from" aria-label="Supplier" maxLength={120} className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="product-image-mobile" className={FIELD_LABEL}>Product image</label>
                <div
                onClick={() => mobileFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setMobileDragging(true); }}
                onDragLeave={() => setMobileDragging(false)}
                onDrop={(e) => { e.preventDefault(); setMobileDragging(false); if (e.dataTransfer.files[0]) handleMobileUpload(e.dataTransfer.files[0]); }}
                className={`mt-1.5 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer transition ${
                  mobileDragging
                    ? 'border-[#facc15] bg-[#facc15]/10 text-[#0b2e59] dark:text-yellow-200'
                    : 'border-gray-300 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a] text-gray-500 dark:text-slate-400 hover:border-[#0b2e59]'
                }`}
              >
                {mobileUploading ? (
                  <span className="inline-block w-4 h-4 border-2 border-[#0b2e59] border-t-transparent rounded-full animate-spin" />
                ) : <BsUpload />}
                <span className="text-xs">{mobileUploading ? 'Uploading...' : 'Upload image'}</span>
                <input ref={mobileFileRef} id="product-image-mobile" type="file" accept="image/*" onChange={(e) => handleMobileUpload(e.target.files[0])} className="hidden" />
                </div>
              </div>
              <div>
                <label htmlFor="product-image-url-mobile" className={FIELD_LABEL}>Or paste an image URL</label>
                <div className="mt-1.5 flex gap-2">
                  <input id="product-image-url-mobile" value={mobileUrlInput} onChange={(e) => setMobileUrlInput(e.target.value)} placeholder="https://..." className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]" />
                  <button type="button" onClick={handleMobileUrlUpload} disabled={mobileUploading || !mobileUrlInput.trim()} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] disabled:opacity-30 disabled:cursor-not-allowed transition">Fetch</button>
                </div>
              </div>
              <div>
                <label htmlFor="product-description-mobile" className={FIELD_LABEL}>Description (optional)</label>
                <textarea
                  id="product-description-mobile"
                  value={mobileForm.description}
                  onChange={(e) => setMobileForm({ ...mobileForm, description: e.target.value })}
                  placeholder="Short sales blurb shown under the product title"
                  title="Short sales blurb shown under the product title"
                  rows={3}
                  maxLength={2000}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59] resize-y"
                />
              </div>
              <DetailsEditor
                idPrefix="product-info-mobile"
                sections={mobileForm.details || []}
                onChange={(details) => setMobileForm({ ...mobileForm, details })}
              />
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
          <div className="modal-box max-w-md my-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
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

      {/* Bulk category dialog */}
      {bulkDialog === 'category' && (
        <dialog className="modal modal-open" aria-label="Set category for selected products">
          <div className="modal-box max-w-sm my-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Set category for {sel.count} product{sel.count === 1 ? '' : 's'}</h3>
              <button onClick={() => setBulkDialog(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none" aria-label="Close">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <CategoryField
                id="bulk-category"
                value={bulkCategory}
                options={categoryOptions}
                onChange={setBulkCategory}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#0b2e59]"
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setBulkDialog(null)} className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition">Cancel</button>
                <button
                  type="button"
                  disabled={!bulkCategory.trim() || bulkBusy}
                  onClick={() => runBulkPatch(() => ({ category: bulkCategory.trim() }), 'Set category')}
                  className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] text-white hover:bg-[#1a4275] disabled:opacity-50 transition"
                >
                  {bulkBusy ? 'Saving...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setBulkDialog(null)}>close</button></form>
        </dialog>
      )}

      {/* Bulk price dialog */}
      {bulkDialog === 'price' && (
        <dialog className="modal modal-open" aria-label="Set price for selected products">
          <div className="modal-box max-w-sm my-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Set price for {sel.count} product{sel.count === 1 ? '' : 's'}</h3>
              <button onClick={() => setBulkDialog(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none" aria-label="Close">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <input
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="New price"
                aria-label="New price"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#0b2e59]"
                autoFocus
              />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Every selected product gets this exact price. Each change is recorded in that product&apos;s price history.
              </p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setBulkDialog(null)} className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition">Cancel</button>
                <button
                  type="button"
                  disabled={bulkPrice === '' || !Number.isFinite(Number(bulkPrice)) || Number(bulkPrice) < 0 || bulkBusy}
                  onClick={() => runBulkPatch(() => ({ price: Number(bulkPrice) }), 'Set price')}
                  className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] text-white hover:bg-[#1a4275] disabled:opacity-50 transition"
                >
                  {bulkBusy ? 'Saving...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setBulkDialog(null)}>close</button></form>
        </dialog>
      )}

      {/* CSV import dialog */}
      {importOpen && (
        <dialog className="modal modal-open" aria-label="Import products from CSV">
          <div className="modal-box max-w-2xl my-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">Import products from CSV</h3>
                {importPreview?.fileName && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{importPreview.fileName}</p>
                )}
              </div>
              <button onClick={() => setImportOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none" aria-label="Close">&times;</button>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {!importPreview && !importResult && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-slate-300">
                    Upload a spreadsheet with a header row. Required columns: <strong>prod_name</strong> and <strong>category</strong>.
                    Optional: <strong>brand, price, stock_quantity, is_active (true/false), image_url, description</strong>.
                    Include the <strong>prod_id</strong> column (from Export CSV) to update existing products instead of creating new ones.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => importFileRef.current?.click()}
                      className="px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] text-white hover:bg-[#1a4275] transition"
                    >
                      Choose CSV file...
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([importTemplateCsv()], { type: 'text/csv' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = 'product-import-template.csv'
                        document.body.appendChild(a)
                        a.click()
                        a.remove()
                        URL.revokeObjectURL(url)
                      }}
                      className="px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition"
                    >
                      Download template
                    </button>
                  </div>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => handleImportFile(e.target.files[0])}
                    className="hidden"
                  />
                </div>
              )}

              {importPreview && !importResult && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
                    {importPreview.rows.length} product{importPreview.rows.length === 1 ? '' : 's'} ready
                    {' '}({importPreview.newCount} new, {importPreview.updateCount} update{importPreview.updateCount === 1 ? '' : 's'})
                    {importPreview.errors.length > 0 && (
                      <span className="text-red-600 dark:text-red-400"> - {importPreview.errors.length} row{importPreview.errors.length === 1 ? '' : 's'} skipped</span>
                    )}
                  </p>
                  {importPreview.errors.length > 0 && (
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-24 overflow-y-auto" aria-label="Rows with problems">
                      {importPreview.errors.slice(0, 10).map((e) => (
                        <li key={e.row}>Row {e.row}: {e.message}</li>
                      ))}
                      {importPreview.errors.length > 10 && <li>...and {importPreview.errors.length - 10} more</li>}
                    </ul>
                  )}
                  {importPreview.rows.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1e3a5f]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-[#162d4a] text-left text-gray-500 dark:text-slate-400 uppercase tracking-widest">
                            <th className="px-2 py-1.5 font-black">{importPreview.updateCount > 0 ? 'Action' : ''}</th>
                            <th className="px-2 py-1.5 font-black">Name</th>
                            <th className="px-2 py-1.5 font-black">Category</th>
                            <th className="px-2 py-1.5 font-black">Price</th>
                            <th className="px-2 py-1.5 font-black">Stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.rows.slice(0, 8).map((r, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-[#1e3a5f]/60 text-gray-700 dark:text-slate-300">
                              <td className="px-2 py-1.5">{r.prod_id ? 'update' : 'new'}</td>
                              <td className="px-2 py-1.5">{r.prod_name}</td>
                              <td className="px-2 py-1.5">{r.category}</td>
                              <td className="px-2 py-1.5">PHP {formatPesos(r.price)}</td>
                              <td className="px-2 py-1.5">{r.stock_quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPreview.rows.length > 8 && (
                        <p className="px-2 py-1.5 text-[11px] text-gray-500 dark:text-slate-400">Showing first 8 of {importPreview.rows.length}.</p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => { setImportPreview(null); }} className="px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition">Choose another file</button>
                    <button
                      type="button"
                      disabled={!importPreview.rows.length || importing}
                      onClick={runImport}
                      className="flex-1 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] text-white hover:bg-[#1a4275] disabled:opacity-50 transition"
                    >
                      {importing ? 'Importing...' : `Import ${importPreview.rows.length} product${importPreview.rows.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
              )}

              {importResult && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100" role="status">
                    Imported: {importResult.created} created, {importResult.updated} updated.
                    {importResult.errors.length > 0 && (
                      <span className="text-red-600 dark:text-red-400"> {importResult.errors.length} row{importResult.errors.length === 1 ? '' : 's'} failed.</span>
                    )}
                  </p>
                  {importResult.errors.length > 0 && (
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-32 overflow-y-auto" aria-label="Failed rows">
                      {importResult.errors.slice(0, 15).map((e, i) => (
                        <li key={i}>Row {e.row}: {e.message}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setImportOpen(false)}
                    className="w-full px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest bg-[#0b2e59] text-white hover:bg-[#1a4275] transition"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setImportOpen(false)}>close</button></form>
        </dialog>
      )}

      {/* Bulk archive confirm */}
      <ConfirmDialog
        open={bulkDialog === 'archive'}
        title={`Archive ${sel.count} product${sel.count === 1 ? '' : 's'}?`}
        message="Archived products disappear from the store but keep their order history. You can restore them from the Archived view."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        danger
        onConfirm={() => runBulkPatch(() => ({ archived: true }), 'Archived')}
        onCancel={() => setBulkDialog(null)}
      />

      {/* Help */}
      {helpOpen && (
        <dialog className="modal modal-open" aria-label="How to manage products">
          <div className="modal-box max-w-lg my-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] p-0 gap-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 text-sm">How to manage products</h3>
              <button onClick={() => setHelpOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none" aria-label="Close">&times;</button>
            </div>
            <div className="p-4 space-y-3 text-sm text-gray-700 dark:text-slate-300 max-h-[65vh] overflow-y-auto">
              <HelpSection title="Adding a product">
                Press <strong>+ New Product</strong>. Name and category are required. The image can be dragged in or fetched from a URL.
                A product saved as <strong>Hidden</strong> stays out of the store until you switch it to <strong>Active</strong>.
              </HelpSection>
              <HelpSection title="Categories">
                Pick an existing category from the dropdown, or choose <strong>+ New category...</strong> to type a new one.
                Typing a brand-new category by hand is what used to create duplicates like &quot;TEST&quot;.
                To rename, hide or reorder the shopper-facing list, use <strong>Navigation -&gt; Categories</strong>.
              </HelpSection>
              <HelpSection title="Price, stock and status">
                Price 0 means the product shows as unavailable - the form warns you. Stock 0 shows an &quot;OUT&quot; badge.
                <strong> Hidden</strong> = not in the store, <strong>Archive</strong> = retired (restorable), <strong>Delete</strong> = gone forever
                (only allowed for products that were never ordered).
              </HelpSection>
              <HelpSection title="Product information sections">
                Under the description, sections like Ingredients or Feeding Guide appear on the product page.
                You can rename sections, remove them, and add your own (up to 12).
                Start a line with &quot;- &quot; for bullets; separate table cells with &quot; | &quot; (first row becomes the header).
              </HelpSection>
              <HelpSection title="Spreadsheet import / export">
                <strong>Export CSV</strong> downloads every product (including IDs - keep it as a backup).
                Edit it in Excel or Google Sheets, then <strong>Import CSV</strong> to upload:
                rows with an ID update that product; rows without an ID create new ones. You always see a preview before anything is saved.
              </HelpSection>
              <HelpSection title="Bulk actions and duplicate">
                Tick the checkbox on rows (or use Select all), then the orange bar appears:
                change category, price or visibility for many products at once, or archive them together.
                The <strong>Copy</strong> button clones a product (saved as Hidden) - handy for 1kg / 5kg / 10kg variants.
              </HelpSection>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setHelpOpen(false)}>close</button></form>
        </dialog>
      )}
    </AdminPage>
  );
};

export default AdminProductManagement;

// -- shared form pieces ----------------------------------------------------

// category picker: a dropdown of known categories with a "+ New category..."
// option that flips to a text input - typos no longer create silent duplicates
function CategoryField({ id, value, options, onChange, className }) {
  const [typing, setTyping] = useState(false);
  const known = options.includes(value);
  const selectOptions = known ? options : [...options, value].filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (typing) {
    return (
      <div className="flex gap-1.5">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New category name"
          title="Pick an existing category or type a new one"
          className={className}
          required
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setTyping(false); onChange(''); }}
          className="px-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] shrink-0"
          title="Back to the category list"
        >
          List
        </button>
      </div>
    );
  }
  return (
    <AdminSelect
      id={id}
      value={known ? value : ''}
      onChange={(v) => {
        if (v === '__new__') { setTyping(true); onChange(''); }
        else onChange(v);
      }}
      ariaLabel="Pick an existing category, or choose New to create one"
      className={className}
      options={[
        { value: '', label: value ? value : 'Choose a category...', disabled: true },
        ...selectOptions.map((c) => ({ value: c, label: c })),
        { value: '__new__', label: '+ New category...' },
      ]}
    />
  );
}

// the Product information group: ordered {label, content} sections the owner
// can rename, remove and extend (the backend accepts any labels, max 12)
function DetailsEditor({ idPrefix, sections, onChange }) {
  const update = (i, patch) => onChange(sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i) => onChange(sections.filter((_, idx) => idx !== i));
  const add = () => onChange([...sections, { label: '', content: '' }]);
  return (
    <details className="rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a]/40 p-3">
      <summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
        Product information (optional)
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
        Each section gets its own heading on the product page - keep the suggested ones or make up your own
        (up to {MAX_SECTIONS}). Start a line with &quot;- &quot; for a bullet; separate table cells with
        &quot; | &quot; (the first row becomes the header row).
      </p>
      <div className="mt-3 space-y-3">
        {sections.map((section, i) => (
          <div key={`${idPrefix}-sec-${i}`} className="rounded-lg border border-gray-200 dark:border-[#1e3a5f]/60 bg-white dark:bg-[#162d4a]/40 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={section.label}
                onChange={(e) => update(i, { label: e.target.value })}
                maxLength={80}
                placeholder="Section heading (e.g. Ingredients)"
                aria-label={`Section ${i + 1} heading`}
                className="flex-1 min-w-0 rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] px-2 py-1.5 text-xs font-semibold text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-[#0b2e59] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                title={`Remove ${section.label?.trim() || 'this section'}`}
                aria-label={`Remove section ${section.label?.trim() || i + 1}`}
              >
                &times;
              </button>
            </div>
            <textarea
              value={section.content}
              onChange={(e) => update(i, { content: e.target.value })}
              rows={3}
              maxLength={4000}
              placeholder={`${section.label?.trim() || 'Section'} details (optional)`}
              aria-label={`Section ${i + 1} content`}
              className="w-full resize-y rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] px-2 py-1.5 text-xs text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-[#0b2e59] focus:outline-none"
            />
          </div>
        ))}
      </div>
      {sections.length < MAX_SECTIONS && (
        <button
          type="button"
          onClick={add}
          className="mt-3 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-[#162d4a] transition"
        >
          + Add section
        </button>
      )}
    </details>
  );
}

function HelpSection({ title, children }) {
  return (
    <div>
      <h4 className="font-black text-[10px] uppercase tracking-widest text-[#0b2e59] dark:text-yellow-200 mb-1">{title}</h4>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
