import React, { useEffect, useState, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPatchAuth, apiDeleteAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, StatusPill, ConfirmDialog } from './adminTheme';
import { BsBoxSeam, BsSearch, BsTrash } from 'react-icons/bs';
import toast from 'react-hot-toast';

const STATUS_KIND = {
  Pending: 'progress',
  Processing: 'progress',
  Shipped: 'progress',
  Delivered: 'success',
  Cancelled: 'danger',
};

const AdminOrders = () => {
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [savingId, setSavingId] = useState(null);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null);
  const PAGE_SIZE = 10;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (openDropdown === null) return;
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openDropdown]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const token = await getToken(); if (!token) return;
      const { items } = await apiGetAuth('/admin/orders', token);
      setAllOrders(items || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  async function changeStatus(order, next) {
    if (next === order.status) return;
    setSavingId(order.order_id);
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/orders/${order.order_id}`, { status: next }, token);
      setAllOrders((prev) => prev.map((o) => o.order_id === order.order_id ? { ...o, status: next } : o));
      toast.success(`Order status changed to ${next}`);
    } catch (err) { toast.error(err.message); }
    finally { setSavingId(null); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const token = await getToken(); if (!token) return;
      await apiDeleteAuth(`/admin/orders/${deleteTarget.order_id}`, token);
      setAllOrders((prev) => prev.filter((o) => o.order_id !== deleteTarget.order_id));
      toast.success('Order deleted');
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
      if (prev.size === orders.length) return new Set();
      return new Set(orders.map((o) => o.order_id));
    });
  }

  async function confirmBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const token = await getToken(); if (!token) return;
      await Promise.all(ids.map((id) => apiDeleteAuth(`/admin/orders/${id}`, token)));
      setAllOrders((prev) => prev.filter((o) => !selected.has(o.order_id)));
      toast.success(`${ids.length} order${ids.length > 1 ? 's' : ''} deleted`);
    } catch (err) { toast.error(err.message); }
    finally { setSelected(new Set()); setBulkDeleteTarget(null); }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const orders = useMemo(() => {
    let list = filter === 'All' ? allOrders : allOrders.filter((o) => o.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) => {
        const name = `${o.firstName || ''} ${o.lastName || ''}`.toLowerCase();
        const id = String(o.order_id || '').toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'customer':
          va = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          vb = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          break;
        case 'total':
          va = Number(a.total_amount || 0);
          vb = Number(b.total_amount || 0);
          break;
        case 'created_at':
          va = a.created_at ? new Date(a.created_at).getTime() : 0;
          vb = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
        case 'status':
          va = a.status || '';
          vb = b.status || '';
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
  }, [allOrders, filter, search, sortKey, sortDir]);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = allOrders.filter((o) => o.status === s).length;
    return acc;
  }, {});
  counts.All = allOrders.length;

  const allSelected = orders.length > 0 && selected.size === orders.length;

  const columns = [
    { key: 'select', label: '', sortable: false,
      render: (o) => (
        <input
          type="checkbox"
          checked={selected.has(o.order_id)}
          onChange={() => toggleSelect(o.order_id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 dark:border-[#1e3a5f] text-[#0b2e59] dark:text-yellow-500 focus:ring-[#0b2e59] cursor-pointer accent-[#0b2e59]"
        />
      ),
    },
    { key: 'id', label: 'Order ID', sortable: true, render: (o) => <span className="text-xs font-mono text-gray-500 dark:text-slate-400">{String(o.order_id).slice(0, 8).toUpperCase()}</span> },
    { key: 'customer', label: 'User Account', sortable: true,
      render: (o) => {
        const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
        return <span className="font-black uppercase text-sm tracking-wide text-gray-900 dark:text-slate-100">{name || 'Guest'}</span>;
      },
    },
    { key: 'details', label: 'Details', sortable: false,
      render: (o) => {
        const totalQty = (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setViewingOrder(o); }}
            className="px-3 py-1.5 rounded-lg bg-[#0b2e59] dark:bg-yellow-600 text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-500 transition flex items-center gap-1.5"
          >
            View Order
            {totalQty > 0 && <span className="bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded text-[9px]">{totalQty}</span>}
          </button>
        );
      },
    },
    { key: 'total', label: 'Total', sortable: true,
      render: (o) => o.total_amount != null
        ? <span className="font-black text-[#0b2e59] dark:text-yellow-200">PHP {Number(o.total_amount).toLocaleString()}</span>
        : <span className="text-gray-400 dark:text-slate-500">-</span>,
    },
    { key: 'created_at', label: 'Placed', sortable: true,
      render: (o) => <span className="text-sm text-gray-500 dark:text-slate-400">{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</span>,
    },
    { key: 'status', label: 'Status', sortable: true,
      render: (o) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusPill kind={STATUS_KIND[o.status] || 'neutral'}>{o.status}</StatusPill>
          <div className="relative">
            <button
              type="button"
              disabled={savingId === o.order_id}
              onClick={() => setOpenDropdown(openDropdown === o.order_id ? null : o.order_id)}
              className="w-[6rem] bg-white dark:bg-[#162d4a] text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-[#1e3a5f] rounded-lg text-[10px] font-black uppercase tracking-widest px-2 py-1.5 text-left focus:outline-none focus:border-[#0b2e59] cursor-pointer flex items-center justify-between gap-1"
            >
              <span className="truncate">{o.status}</span>
              <svg className="w-2.5 h-2.5 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === o.order_id && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] rounded-lg shadow-lg overflow-hidden">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { changeStatus(o, s); setOpenDropdown(null); }}
                    className={`w-full text-left px-2 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-[#1e3a5f] ${s === o.status ? 'text-[#0b2e59] dark:text-yellow-200 bg-gray-50 dark:bg-[#1e3a5f]/50' : 'text-gray-700 dark:text-slate-300'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    { key: 'actions', label: '', sortable: false,
      render: (o) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(o); }}
          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          title="Delete order"
        >
          <BsTrash className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <AdminPage title="Order Management" subtitle="Track and move orders through their lifecycle.">

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard label="Orders in View" value={orders.length} loading={loading} />
        <StatCard label="Total Value" value={`PHP ${totalRevenue.toLocaleString()}`} loading={loading} />
        <StatCard label="Pending" value={counts.Pending || 0} loading={loading} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or order ID..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59]"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {['All', ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${
              filter === s
                ? 'bg-[#0b2e59] text-white'
                : 'bg-white dark:bg-[#162d4a] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] border border-gray-200 dark:border-[#1e3a5f]'
            }`}
          >
            {s} <span className="ml-1 opacity-60">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {selected.size > 0 && (
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
        rows={orders}
        rowKey={(o) => o.order_id}
        loading={loading}
        colSpan={8}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        renderMobileCard={(o) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500">#{String(o.order_id).slice(0, 8).toUpperCase()}</span>
              <StatusPill kind={STATUS_KIND[o.status] || 'neutral'}>{o.status}</StatusPill>
            </div>
            <div className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{`${o.firstName || ''} ${o.lastName || ''}`.trim() || 'Guest'}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {o.total_amount != null ? `PHP ${Number(o.total_amount).toLocaleString()}` : '-'}
              {o.created_at && <span className="ml-1.5">· {new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
            </div>
            <div className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-gray-50 dark:border-[#1e3a5f]/40">
              <button type="button" onClick={(e) => { e.stopPropagation(); setViewingOrder(o); }} className="px-2.5 py-1 rounded bg-[#0b2e59] text-white text-[10px] font-bold">View</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteTarget(o); }} className="px-2.5 py-1 rounded text-red-400 text-[10px] font-bold">Delete</button>
            </div>
          </div>
        )}
        empty={
          <EmptyState
            icon={<BsBoxSeam />}
            title={filter === 'All' ? 'No orders yet' : `No ${filter.toLowerCase()} orders`}
            message={filter === 'All'
              ? 'When customers complete checkout their orders will show up here.'
              : 'Try a different status filter to see other orders.'}
          />
        }
      />

      {/* Order Detail Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setViewingOrder(null)}>
          <div className="bg-white dark:bg-[#0f2847] rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Order Details</h3>
                <p className="text-xs font-mono text-gray-500 dark:text-slate-400">#{String(viewingOrder.order_id).slice(0, 8).toUpperCase()}</p>
              </div>
              <button type="button" onClick={() => setViewingOrder(null)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-500 dark:text-slate-400 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* customer info */}
              <div className="bg-gray-50 dark:bg-[#162d4a] rounded-lg p-3 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">Customer Information</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500 dark:text-slate-400">Name: </span><span className="font-semibold text-gray-800 dark:text-slate-200">{viewingOrder.customer_name || viewingOrder.firstName || 'N/A'}</span></div>
                  <div><span className="text-gray-500 dark:text-slate-400">Phone: </span><span className="font-semibold text-gray-800 dark:text-slate-200">{viewingOrder.phone || 'N/A'}</span></div>
                  <div className="col-span-2"><span className="text-gray-500 dark:text-slate-400">Address: </span><span className="font-semibold text-gray-800 dark:text-slate-200">{viewingOrder.address || 'N/A'}</span></div>
                </div>
              </div>

              {/* items */}
              <div className="bg-gray-50 dark:bg-[#162d4a] rounded-lg p-3 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">Items Ordered ({(viewingOrder.items || []).reduce((s, i) => s + (i.quantity || 0), 0)} total)</p>
                <div className="space-y-1.5">
                  {(viewingOrder.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-gray-800 dark:text-slate-200 truncate">{item.name}</span>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-xs text-gray-500 dark:text-slate-400">x{item.quantity}</span>
                        <span className="font-semibold text-gray-800 dark:text-slate-200">PHP {Number(item.subtotal).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                  {(!viewingOrder.items || viewingOrder.items.length === 0) && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 italic">No item details available</p>
                  )}
                </div>
              </div>

              {/* payment */}
              <div className="bg-gray-50 dark:bg-[#162d4a] rounded-lg p-3 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">Payment</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500 dark:text-slate-400">Method: </span><span className="font-semibold text-gray-800 dark:text-slate-200 uppercase">{viewingOrder.payment?.method || 'N/A'}</span></div>
                  <div><span className="text-gray-500 dark:text-slate-400">Amount: </span><span className="font-bold text-[#0b2e59] dark:text-yellow-300">PHP {Number(viewingOrder.payment?.amount || viewingOrder.total_amount).toLocaleString()}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Order"
        message={`Are you sure you want to delete order #${deleteTarget?.order_id?.slice(0, 8).toUpperCase()}? This will also remove all items and payment records. This action cannot be undone.`}
        confirmLabel="Delete Order"
        cancelLabel="Keep Order"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!bulkDeleteTarget}
        title="Delete Selected Orders"
        message={`Are you sure you want to delete ${selected.size} order${selected.size > 1 ? 's' : ''}? This will also remove all items and payment records. This action cannot be undone.`}
        confirmLabel={`Delete ${selected.size} Order${selected.size > 1 ? 's' : ''}`}
        cancelLabel="Keep Orders"
        danger
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteTarget(null)}
      />
    </AdminPage>
  );
};

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export default AdminOrders;
