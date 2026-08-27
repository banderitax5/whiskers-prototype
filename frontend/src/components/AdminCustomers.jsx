import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, ErrorBanner, StatCard, StatusPill } from './adminTheme';
import { BsPeople, BsSearch } from 'react-icons/bs';

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { items } = await apiGetAuth('/admin/customers', session.access_token);
        if (!cancelled) setCustomers(items || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = customers.filter((u) => {
    const q = search.toLowerCase();
    return !q || `${u.firstName || ''} ${u.lastName || ''} ${u.phone || ''}`.toLowerCase().includes(q);
  });

  const columns = [
    {
      key: 'name', label: 'Customer',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-yellow-400 text-[#0b2e59] flex items-center justify-center font-black text-sm">
            {(u.firstName?.[0] || u.lastName?.[0] || '?').toUpperCase()}
          </div>
          <span className="font-black uppercase text-sm tracking-wide text-gray-900">
            {`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown'}
          </span>
        </div>
      ),
    },
    { key: 'phone', label: 'Contact', render: (u) => <span className="text-gray-700">{u.phone || 'N/A'}</span> },
    {
      key: 'feedback', label: 'Feedback',
      render: (u) => u.feedback
        ? <span className="italic text-sm text-gray-700">"{u.feedback}"</span>
        : <span className="text-gray-400 italic text-sm">No feedback yet</span>,
    },
    { key: 'status', label: 'Status', render: () => <StatusPill kind="progress">User</StatusPill> },
  ];

  return (
    <AdminPage title="Customer Management" subtitle="People who signed up to your store.">
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Registered" value={customers.length} />
        <StatCard label="With Feedback" value={customers.filter((c) => c.feedback).length} />
        <StatCard label="Search Results" value={filtered.length} />
      </div>

      <div className="mb-4 relative max-w-md">
        <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0b2e59]"
        />
      </div>

      <AdminTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        loading={loading}
        colSpan={4}
        empty={
          <EmptyState
            icon={<BsPeople />}
            title={search ? 'No matching customers' : 'No customers yet'}
            message={search
              ? 'Try a different name or phone number.'
              : 'When shoppers sign up they will show up here. Share the storefront to get started.'}
          />
        }
      />
    </AdminPage>
  );
};

export default AdminCustomers;
