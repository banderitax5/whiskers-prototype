import React, { useState, useEffect, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGetAllPages, apiDeleteAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, ConfirmDialog } from './adminTheme';
import { BsCreditCard, BsSearch, BsTrash, BsExclamationTriangle, BsArrowClockwise } from 'react-icons/bs';
import { useRole } from '../context/RoleContext';
import toast from 'react-hot-toast';

const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('payment_date');
  const [sortDir, setSortDir] = useState('desc');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { items } = await apiGetAllPages('/admin/payments', session.access_token);
        if (!cancelled) setPayments(items || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await apiDeleteAuth(`/admin/payments/${deleteTarget.payment_id}`, session.access_token);
      setPayments((prev) => prev.filter((p) => p.payment_id !== deleteTarget.payment_id));
      toast.success('Payment record deleted');
    } catch (err) { toast.error(err.message); }
    finally { setDeleteTarget(null); }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size === filteredPayments.length) return new Set();
      return new Set(filteredPayments.map((p) => p.payment_id));
    });
  }

  async function confirmBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await Promise.all(ids.map((id) => apiDeleteAuth(`/admin/payments/${id}`, session.access_token)));
      setPayments((prev) => prev.filter((p) => !selected.has(p.payment_id)));
      toast.success(`${ids.length} payment record${ids.length > 1 ? 's' : ''} deleted`);
    } catch (err) { toast.error(err.message); }
    finally { setSelected(new Set()); setBulkDeleteTarget(null); }
  }

  const filteredPayments = useMemo(() => {
    let list = [...payments];
    const min = priceMin !== '' ? Number(priceMin) : null;
    const max = priceMax !== '' ? Number(priceMax) : null;
    if (min !== null) list = list.filter((p) => Number(p.amount || 0) >= min);
    if (max !== null) list = list.filter((p) => Number(p.amount || 0) <= max);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
        const method = (p.method || '').toLowerCase();
        const id = String(p.payment_id || '').toLowerCase();
        const orderId = String(p.order_id || '').toLowerCase();
        return name.includes(q) || method.includes(q) || id.includes(q) || orderId.includes(q);
      });
    }

    list.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'customer':
          va = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          vb = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          break;
        case 'amount':
          va = Number(a.amount || 0);
          vb = Number(b.amount || 0);
          break;
        case 'payment_date':
          va = a.payment_date ? new Date(a.payment_date).getTime() : 0;
          vb = b.payment_date ? new Date(b.payment_date).getTime() : 0;
          break;
        case 'method':
          va = (a.method || '').toLowerCase();
          vb = (b.method || '').toLowerCase();
          break;
        case 'status':
          va = (a.status || '').toLowerCase();
          vb = (b.status || '').toLowerCase();
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
  }, [payments, sortKey, sortDir, priceMin, priceMax, search]);

  const totalRevenue = filteredPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const avgPayment = filteredPayments.length ? totalRevenue / filteredPayments.length : 0;

  const allSelected = filteredPayments.length > 0 && selected.size === filteredPayments.length;

  // deleting payments is admin-only on the backend, so staff never see it
  const canDelete = useRole() === 'admin';

  const columns = [
    ...(canDelete ? [{
      key: 'select', label: '', sortable: false,
      render: (p) => (
        <input
          type="checkbox"
          checked={selected.has(p.payment_id)}
          onChange={() => toggleSelect(p.payment_id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 dark:border-[#1e3a5f] text-[#0b2e59] dark:text-yellow-500 focus:ring-[#0b2e59] cursor-pointer accent-[#0b2e59]"
        />
      ),
    }] : []),
    { key: 'payment_id', label: 'Trans. ID', render: (p) => <span className="text-xs font-mono text-gray-500 dark:text-slate-400">{String(p.payment_id).slice(0, 8).toUpperCase()}</span> },
    { key: 'order_id', label: 'Order ID', sortable: true, render: (p) => <span className="text-xs font-mono text-gray-500 dark:text-slate-400">{String(p.order_id).slice(0, 8).toUpperCase()}</span> },
    { key: 'customer', label: 'Customer', sortable: true,
      render: (p) => {
        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
        return <span className="font-black uppercase text-sm tracking-wide text-gray-900 dark:text-slate-100">{name || 'Guest'}</span>;
      },
    },
    { key: 'amount', label: 'Amount', sortable: true,
      render: (p) => <span className="font-black text-lg text-[#0b2e59] dark:text-yellow-200">PHP {Number(p.amount || 0).toLocaleString()}</span>,
    },
    { key: 'method', label: 'Method', sortable: true,
      render: (p) => <span className="px-3 py-1 rounded-full border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-800 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest">{p.method}</span>,
    },
    { key: 'status', label: 'Status', sortable: true,
      render: (p) => <span className="px-3 py-1 rounded-full border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-800 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest">{p.status}</span>,
    },
    { key: 'payment_date', label: 'Date', sortable: true,
      render: (p) => <span className="text-sm text-gray-600 dark:text-slate-400 font-medium">
        {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
      </span>,
    },
    ...(canDelete ? [{
      key: 'actions', label: '', sortable: false,
      render: (p) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          title="Delete payment"
        >
          <BsTrash className="w-4 h-4" />
        </button>
      ),
    }] : []),
  ];

  return (
    <AdminPage title="Payment Transactions" subtitle="Every transaction that flowed through the store.">

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard label="Total Revenue" value={`PHP ${totalRevenue.toLocaleString()}`} loading={loading} />
        <StatCard label="Transactions" value={filteredPayments.length} loading={loading} />
        <StatCard label="Avg. Payment" value={filteredPayments.length ? `PHP ${Math.round(avgPayment).toLocaleString()}` : 'PHP 0'} loading={loading} />
      </div>

      {error && !loading ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Payments unavailable"
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
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, method, or ID..."
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

      {canDelete && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <span className="text-sm font-semibold text-red-700 dark:text-red-300">{selected.size} selected</span>
          <button
            onClick={toggleSelectAll}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white dark:bg-[#162d4a] border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={() => setBulkDeleteTarget(true)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition flex items-center gap-1.5"
          >
            <BsTrash className="w-3 h-3" /> Delete Selected
          </button>
        </div>
      )}

      <AdminTable
        columns={columns}
        rows={filteredPayments}
        rowKey={(p) => p.payment_id}
        loading={loading}
        colSpan={9}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        renderMobileCard={(p) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500">#{String(p.payment_id).slice(0, 8).toUpperCase()}</span>
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-800 dark:text-slate-200">{p.status}</span>
            </div>
            <div className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Guest'}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              PHP {Number(p.amount || 0).toLocaleString()}
              <span className="ml-1.5">· {p.method}</span>
              {p.payment_date && <span className="ml-1.5">· {new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
            </div>
            <div className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-gray-50 dark:border-[#1e3a5f]/40">
              {canDelete && <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }} className="px-2.5 py-1 rounded text-red-400 text-[10px] font-bold">Delete</button>}
            </div>
          </div>
        )}
        empty={
          <EmptyState
            icon={<BsCreditCard />}
            title="No payments recorded"
            message="Once a customer completes checkout, their transaction will appear here."
          />
        }
      />
      </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Payment"
        message={`Are you sure you want to delete payment #${deleteTarget?.payment_id?.slice(0, 8).toUpperCase()}? This action cannot be undone.`}
        confirmLabel="Delete Payment"
        cancelLabel="Keep Payment"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!bulkDeleteTarget}
        title="Delete Selected Payments"
        message={`Are you sure you want to delete ${selected.size} payment record${selected.size > 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel={`Delete ${selected.size} Payment${selected.size > 1 ? 's' : ''}`}
        cancelLabel="Keep Payments"
        danger
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteTarget(null)}
      />
    </AdminPage>
  );
};

export default AdminPayments;
