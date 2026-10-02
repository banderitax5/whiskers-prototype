import React, { useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import { apiGetAuth, apiPatchAuth, apiDeleteAuth } from '../lib/api';
import { AdminPage, AdminTable, EmptyState, StatCard, StatusPill, ConfirmDialog } from './adminTheme';
import { BsPeople, BsSearch, BsTrash } from 'react-icons/bs';
import toast from 'react-hot-toast';

const ROLES = ['user', 'admin'];
const ROLE_KIND = { user: 'progress', admin: 'success' };

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const [{ items }, { data: { user } }] = await Promise.all([
          apiGetAuth('/admin/customers', session.access_token),
          supabase.auth.getUser(),
        ]);
        if (!cancelled) {
          setCustomers(items || []);
          setCurrentUserId(user?.id || null);
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

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
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={savingId === u.id}
              onClick={() => setOpenDropdown(openDropdown === u.id ? null : u.id)}
              className="w-[6rem] bg-white dark:bg-[#162d4a] text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-[#1e3a5f] rounded-lg text-[10px] font-black uppercase tracking-widest px-2 py-1.5 text-left focus:outline-none focus:border-[#0b2e59] cursor-pointer flex items-center justify-between gap-1"
            >
              <span className="truncate">{u.role}</span>
              <svg className="w-2.5 h-2.5 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openDropdown === u.id && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] rounded-lg shadow-lg overflow-hidden">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => changeRole(u, r)}
                    className={`w-full text-left px-2 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-[#1e3a5f] ${r === u.role ? 'text-[#0b2e59] dark:text-yellow-200 bg-gray-50 dark:bg-[#1e3a5f]/50' : 'text-gray-700 dark:text-slate-300'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
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

      <AdminTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        loading={loading}
        colSpan={4}
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
