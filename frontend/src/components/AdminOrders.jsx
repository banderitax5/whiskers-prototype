import React, { useEffect, useState, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPatchAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, StatusPill } from './adminTheme';
import { BsBoxSeam, BsSearch } from 'react-icons/bs';
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
        const phone = (o.phone || '').toLowerCase();
        const id = String(o.order_id || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || id.includes(q);
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

  const columns = [
    { key: 'id', label: 'Order ID', sortable: true, render: (o) => <span className="text-xs font-mono text-gray-500 dark:text-slate-400">{String(o.order_id).slice(0, 8).toUpperCase()}</span> },
    { key: 'customer', label: 'Customer', sortable: true,
      render: (o) => {
        const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
        return <span className="font-black uppercase text-sm tracking-wide text-gray-900 dark:text-slate-100">{name || 'Guest'}</span>;
      },
    },
    { key: 'phone', label: 'Contact', render: (o) => <span className="text-sm text-gray-600 dark:text-slate-400">{o.phone || 'N/A'}</span> },
    { key: 'total', label: 'Total', sortable: true,
      render: (o) => o.total_amount != null
        ? <span className="font-black text-[#0b2e59] dark:text-yellow-200">PHP {Number(o.total_amount).toLocaleString()}</span>
        : <span className="text-gray-400 dark:text-slate-500">-</span>,
    },
    {
      key: 'payment', label: 'Payment',
      render: (o) => o.payment
        ? <span className="px-3 py-1 rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-gray-50 dark:bg-[#162d4a] text-gray-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest">{o.payment.method} - PHP {Number(o.payment.amount || 0).toLocaleString()}</span>
        : <span className="text-gray-400 dark:text-slate-500 text-xs italic">Unpaid</span>,
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
  ];

  return (
    <AdminPage title="Order Management" subtitle="Track and move orders through their lifecycle.">

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Orders in View" value={orders.length} />
        <StatCard label="Total Value" value={`PHP ${totalRevenue.toLocaleString()}`} />
        <StatCard label="Pending" value={counts.Pending || 0} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, phone, or order ID..."
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

      <AdminTable
        columns={columns}
        rows={orders}
        rowKey={(o) => o.order_id}
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
            title={filter === 'All' ? 'No orders yet' : `No ${filter.toLowerCase()} orders`}
            message={filter === 'All'
              ? 'When customers complete checkout their orders will show up here.'
              : 'Try a different status filter to see other orders.'}
          />
        }
      />
    </AdminPage>
  );
};

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export default AdminOrders;
