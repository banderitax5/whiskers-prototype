import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import { apiGetAllPages, apiPatchAuth, apiDeleteAuth } from '../lib/api';
import { formatPesos } from '../lib/cartLogic';
import { AdminPage, AdminTable, AdminRowDropdown, EmptyState, StatCard, StatusPill, ConfirmDialog } from './adminTheme';
import { BsPeople, BsSearch, BsTrash, BsExclamationTriangle, BsArrowClockwise } from 'react-icons/bs';
import toast from 'react-hot-toast';

const ROLES = ['user', 'staff', 'admin'];
const ROLE_KIND = { user: 'progress', staff: 'info', admin: 'success' };

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [page, setPage] = useState(1);
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
        const [{ items }, { data: { user } }] = await Promise.all([
          apiGetAllPages('/admin/customers', session.access_token),
          supabase.auth.getUser(),
        ]);
        if (!cancelled) {
          setCustomers(items || []);
          setCurrentUserId(user?.id || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    if (openDropdown === null) return;
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openDropdown]);

  async function changeRole(customer, nextRole) {
    if (nextRole === customer.role) return;
    setSavingId(customer.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await apiPatchAuth(`/admin/customers/${customer.id}/role`, { role: nextRole }, session.access_token);
      setCustomers((prev) => prev.map((c) => c.id === customer.id ? { ...c, role: nextRole } : c));
      toast.success(`Role changed to ${nextRole}`);
    } catch (err) {
      if (err.message !== 'Verification cancelled') toast.error(err.message);
    } finally {
      setSavingId(null);
      setOpenDropdown(null);
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    setSavingId(target.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await apiDeleteAuth(`/admin/customers/${target.id}`, session.access_token);
      setCustomers((prev) => prev.filter((c) => c.id !== target.id));
      toast.success('Customer removed');
    } catch (err) {
      if (err.message !== 'Verification cancelled') toast.error(err.message);
    } finally {
      setSavingId(null);
    }
  }

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
          <span className="font-black uppercase text-sm tracking-wide text-gray-900 dark:text-slate-100">
            {`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown'}
          </span>
        </div>
      ),
    },
    { key: 'phone', label: 'Contact', render: (u) => <span className="text-gray-700 dark:text-slate-300">{u.phone || 'N/A'}</span> },
    { key: 'ordersCount', label: 'Orders',
      render: (u) => u.ordersCount > 0
        ? <span className="font-black text-sm text-gray-900 dark:text-slate-100">{u.ordersCount}</span>
        : <span className="text-gray-400 dark:text-slate-500">0</span>,
    },
    { key: 'totalSpent', label: 'Spent',
      render: (u) => u.totalSpent > 0
        ? <span className="font-black text-sm text-[#0b2e59] dark:text-yellow-200">PHP {formatPesos(Number(u.totalSpent))}</span>
        : <span className="text-gray-400 dark:text-slate-500">-</span>,
    },
    {
      key: 'feedback', label: 'Feedback',
      render: (u) => u.feedback
        ? <span className="italic text-sm text-gray-700 dark:text-slate-300">"{u.feedback}"</span>
        : <span className="text-gray-400 dark:text-slate-500 italic text-sm">No feedback yet</span>,
    },
    {
      key: 'role', label: 'Role',
      render: (u) => (
        <div className="flex items-center justify-between gap-2 w-full" onClick={(e) => e.stopPropagation()}>
          <span className="flex justify-center w-[4.75rem] shrink-0">
            <StatusPill kind={ROLE_KIND[u.role] || 'neutral'}>{u.role}</StatusPill>
          </span>
          <AdminRowDropdown
            open={openDropdown === u.id}
            onToggle={() => setOpenDropdown(openDropdown === u.id ? null : u.id)}
            onClose={() => setOpenDropdown(null)}
            value={u.role}
            options={ROLES}
            disabled={savingId === u.id}
            onSelect={(r) => changeRole(u, r)}
          />
          {u.id !== currentUserId ? (
            <button
              type="button"
              disabled={savingId === u.id}
              onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); setDeleteTarget(u); }}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-300"
              title="Remove customer"
              aria-label={`Remove ${u.firstName || u.lastName || 'customer'}`}
            >
              <BsTrash className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="w-7 h-7 shrink-0" aria-hidden="true" />
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminPage title="Customer Management" subtitle="People who signed up to your store.">

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard label="Total Registered" value={customers.length} loading={loading} />
        <StatCard label="With Feedback" value={customers.filter((c) => c.feedback).length} loading={loading} />
        <StatCard label="Search Results" value={filtered.length} loading={loading} />
      </div>

      <div className="mb-4 relative max-w-md">
        <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or phone..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-300 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b2e59]"
        />
      </div>

      {error && !loading ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Customers unavailable"
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
      <AdminTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        loading={loading}
        colSpan={6}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        renderMobileCard={(u) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-yellow-400 text-[#0b2e59] flex items-center justify-center font-black text-[10px] shrink-0">
                  {(u.firstName?.[0] || u.lastName?.[0] || '?').toUpperCase()}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">
                  {`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown'}
                </span>
              </div>
              <StatusPill kind={ROLE_KIND[u.role] || 'neutral'}>{u.role}</StatusPill>
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 pl-9">
              {u.phone || 'No phone'}
              {u.ordersCount > 0 && <span className="ml-1.5">· {u.ordersCount} order{u.ordersCount > 1 ? 's' : ''}</span>}
              {u.totalSpent > 0 && <span className="ml-1.5">· PHP {formatPesos(Number(u.totalSpent))}</span>}
              {u.feedback && <span className="ml-1.5">· Has feedback</span>}
            </div>
          </div>
        )}
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
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove customer"
        message={`Are you sure you want to remove ${deleteTarget ? `${deleteTarget.firstName || ''} ${deleteTarget.lastName || ''}`.trim() || 'this customer' : ''}? This permanently deletes their account and cannot be undone.`}
        confirmLabel="Remove Customer"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </AdminPage>
  );
};

export default AdminCustomers;
