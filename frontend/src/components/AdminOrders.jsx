import React, { useEffect, useState, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPatchAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, ErrorBanner, StatCard, StatusPill } from './adminTheme';
import { BsBoxSeam } from 'react-icons/bs';

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
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [savingId, setSavingId] = useState(null);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => { fetchAll(); }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const token = await getToken(); if (!token) return;
      const { items } = await apiGetAuth('/admin/orders', token);
      setAllOrders(items || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function changeStatus(order, next) {
    if (next === order.status) return;
    setSavingId(order.order_id);
    try {
      const token = await getToken(); if (!token) return;
      await apiPatchAuth(`/admin/orders/${order.order_id}`, { status: next }, token);
      setAllOrders((prev) => prev.map((o) => o.order_id === order.order_id ? { ...o, status: next } : o));
    } catch (err) { alert(err.message); }
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
  }, [allOrders, filter, sortKey, sortDir]);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = allOrders.filter((o) => o.status === s).length;
    return acc;
  }, {});
  counts.All = allOrders.length;

  const columns = [
    { key: 'id', label: 'Order ID', sortable: true, render: (o) => <span className="text-xs font-mono text-gray-500">{String(o.order_id).slice(0, 8).toUpperCase()}</span> },
    { key: 'customer', label: 'Customer', sortable: true,
      render: (o) => {
        const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
        return <span className="font-black uppercase text-sm tracking-wide text-gray-900">{name || 'Guest'}</span>;
      },
    },
    { key: 'phone', label: 'Contact', render: (o) => <span className="text-sm text-gray-600">{o.phone || 'N/A'}</span> },
    { key: 'total', label: 'Total', sortable: true,
      render: (o) => o.total_amount != null
        ? <span className="font-black text-[#0b2e59]">PHP {Number(o.total_amount).toLocaleString()}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'payment', label: 'Payment',
      render: (o) => o.payment
        ? <span className="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 text-[10px] font-black uppercase tracking-widest">{o.payment.method} - PHP {Number(o.payment.amount || 0).toLocaleString()}</span>
        : <span className="text-gray-400 text-xs italic">Unpaid</span>,
    },
    { key: 'created_at', label: 'Placed', sortable: true,
      render: (o) => <span className="text-sm text-gray-500">{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</span>,
    },
    { key: 'status', label: 'Status', sortable: true,
      render: (o) => (
        <div className="flex items-center gap-2">
          <StatusPill kind={STATUS_KIND[o.status] || 'neutral'}>{o.status}</StatusPill>
          <select
            value={o.status}
            disabled={savingId === o.order_id}
            onChange={(e) => changeStatus(o, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-gray-700 border border-gray-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-[#0b2e59]"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ),
    },
  ];

  return (
    <AdminPage title="Order Management" subtitle="Track and move orders through their lifecycle.">
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Orders in View" value={orders.length} />
        <StatCard label="Total Value" value={`PHP ${totalRevenue.toLocaleString()}`} />
        <StatCard label="Pending" value={counts.Pending || 0} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {['All', ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${
              filter === s
                ? 'bg-[#0b2e59] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
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
