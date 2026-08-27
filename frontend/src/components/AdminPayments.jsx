import React, { useState, useEffect, useMemo } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, ErrorBanner, StatCard } from './adminTheme';
import { BsCreditCard } from 'react-icons/bs';

const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('payment_date');
  const [sortDir, setSortDir] = useState('desc');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { items } = await apiGetAuth('/admin/payments', session.access_token);
        if (!cancelled) setPayments(items || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filteredPayments = useMemo(() => {
    let list = [...payments];
    const min = priceMin !== '' ? Number(priceMin) : null;
    const max = priceMax !== '' ? Number(priceMax) : null;
    if (min !== null) list = list.filter((p) => Number(p.amount || 0) >= min);
    if (max !== null) list = list.filter((p) => Number(p.amount || 0) <= max);

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
        default:
          va = a[sortKey] ?? '';
          vb = b[sortKey] ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [payments, sortKey, sortDir, priceMin, priceMax]);

  const totalRevenue = filteredPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const avgPayment = filteredPayments.length ? totalRevenue / filteredPayments.length : 0;

  const columns = [
    { key: 'payment_id', label: 'Trans. ID', render: (p) => <span className="text-xs font-mono text-gray-500">{String(p.payment_id).slice(0, 8).toUpperCase()}</span> },
    { key: 'customer', label: 'Customer', sortable: true,
      render: (p) => {
        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
        return <span className="font-black uppercase text-sm tracking-wide text-gray-900">{name || 'Guest'}</span>;
      },
    },
    { key: 'amount', label: 'Amount', sortable: true,
      render: (p) => <span className="font-black text-lg text-[#0b2e59]">PHP {Number(p.amount || 0).toLocaleString()}</span>,
    },
    { key: 'method', label: 'Method', sortable: true,
      render: (p) => <span className="px-3 py-1 rounded-full border border-gray-300 bg-white text-gray-800 text-[10px] font-black uppercase tracking-widest">{p.method}</span>,
    },
    { key: 'payment_date', label: 'Date', sortable: true,
      render: (p) => <span className="text-sm text-gray-600 font-medium">
        {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
      </span>,
    },
  ];

  return (
    <AdminPage title="Payment Transactions" subtitle="Every transaction that flowed through the store.">
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Revenue" value={`PHP ${totalRevenue.toLocaleString()}`} />
        <StatCard label="Transactions" value={filteredPayments.length} />
        <StatCard label="Avg. Payment" value={filteredPayments.length ? `PHP ${Math.round(avgPayment).toLocaleString()}` : 'PHP 0'} />
      </div>

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
        rows={filteredPayments}
        rowKey={(p) => p.payment_id}
        loading={loading}
        colSpan={5}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        empty={
          <EmptyState
            icon={<BsCreditCard />}
            title="No payments recorded"
            message="Once a customer completes checkout, their transaction will appear here."
          />
        }
      />
    </AdminPage>
  );
};

export default AdminPayments;
