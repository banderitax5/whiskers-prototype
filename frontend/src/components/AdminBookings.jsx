import React, { useState, useEffect, useMemo } from 'react'
import supabase from '../lib/supabase'
import { apiGetAllPages, apiPatchAuth, apiDeleteAuth } from '../lib/api'
import { AdminPage, AdminTable, EmptyState, StatCard, StatusPill, ConfirmDialog } from './adminTheme'
import { useRole } from '../context/RoleContext'
import { BsClipboardCheck, BsExclamationTriangle, BsArrowClockwise, BsTrash } from 'react-icons/bs'
import toast from 'react-hot-toast'

const STATUS_KIND = {
  Pending: 'progress',
  Approved: 'success',
  Rejected: 'danger',
  Cancelled: 'neutral',
}
const STATUSES = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled']

const AdminBookings = () => {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('All')
  const [savingId, setSavingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const PAGE_SIZE = 10
  const canDelete = useRole() === 'admin'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Your session has expired. Sign in again.')
        const { items } = await apiGetAllPages('/admin/bookings', session.access_token)
        if (!cancelled) setBookings(items || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadKey])

  const filtered = useMemo(
    () => (filter === 'All' ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  )

  const pending = bookings.filter((b) => b.status === 'Pending').length

  function changeStatus(b, status) {
    setSavingId(b.booking_id)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Your session has expired. Sign in again.')
        await apiPatchAuth(`/admin/bookings/${b.booking_id}`, { status }, session.access_token)
        setBookings((prev) => prev.map((x) => x.booking_id === b.booking_id ? { ...x, status } : x))
        toast.success(`Booking ${status.toLowerCase()}`)
      } catch (err) {
        if (err.message !== 'Verification cancelled') toast.error(err.message)
      } finally {
        setSavingId(null)
      }
    })()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Your session has expired. Sign in again.')
      await apiDeleteAuth(`/admin/bookings/${deleteTarget.booking_id}`, session.access_token)
      setBookings((prev) => prev.filter((b) => b.booking_id !== deleteTarget.booking_id))
      toast.success('Booking deleted')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleteTarget(null)
    }
  }

  const formatDate = (ts) => ts
    ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-'

  const columns = [
    { key: 'customer', label: 'Customer',
      render: (b) => <span className="font-black uppercase text-sm tracking-wide text-gray-900 dark:text-slate-100">{`${b.firstName || ''} ${b.lastName || ''}`.trim() || 'Unknown'}</span>,
    },
    { key: 'service', label: 'Service',
      render: (b) => <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{b.service_name}</span>,
    },
    { key: 'preferred_date', label: 'Preferred', sortable: true,
      render: (b) => <span className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">{b.preferred_date || '-'}</span>,
    },
    { key: 'notes', label: 'Notes',
      render: (b) => <span className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2 max-w-[220px]" title={b.notes || ''}>{b.notes || '-'}</span>,
    },
    { key: 'created_at', label: 'Requested', sortable: true,
      render: (b) => <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(b.created_at)}</span>,
    },
    { key: 'status', label: 'Status',
      render: (b) => <StatusPill kind={STATUS_KIND[b.status] || 'neutral'}>{b.status}</StatusPill>,
    },
    { key: 'actions', label: '', sortable: false,
      render: (b) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {b.status === 'Pending' && (
            <>
              <button
                type="button"
                disabled={savingId === b.booking_id}
                onClick={() => changeStatus(b, 'Approved')}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition disabled:opacity-50 min-h-[36px]"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={savingId === b.booking_id}
                onClick={() => changeStatus(b, 'Rejected')}
                className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-50 min-h-[36px]"
              >
                Reject
              </button>
            </>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setDeleteTarget(b)}
              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              title="Delete booking"
            >
              <BsTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <AdminPage title="Service Bookings" subtitle="Requests customers made from the Services page, with approve and reject controls.">

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard label="Total Bookings" value={bookings.length} loading={loading} />
        <StatCard label="Pending Review" value={pending} loading={loading} />
        <StatCard label="Approved" value={bookings.filter((b) => b.status === 'Approved').length} loading={loading} />
      </div>

      {!loading && error && bookings.length === 0 ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Bookings unavailable"
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
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => { setFilter(s); setPage(1) }}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${
                  filter === s
                    ? 'bg-[#0b2e59] text-white'
                    : 'bg-white dark:bg-[#162d4a] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] border border-gray-200 dark:border-[#1e3a5f]'
                }`}
              >
                {s} <span className="ml-1 opacity-60">{s === 'All' ? bookings.length : bookings.filter((b) => b.status === s).length}</span>
              </button>
            ))}
          </div>

          <AdminTable
            columns={columns}
            rows={filtered}
            rowKey={(b) => b.booking_id}
            loading={loading}
            colSpan={7}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            renderMobileCard={(b) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{`${b.firstName || ''} ${b.lastName || ''}`.trim() || 'Unknown'}</span>
                  <StatusPill kind={STATUS_KIND[b.status] || 'neutral'}>{b.status}</StatusPill>
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-300 font-semibold">{b.service_name}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  {b.preferred_date || '-'}
                  {b.created_at && <span className="ml-1.5">· {formatDate(b.created_at)}</span>}
                </div>
                {b.notes && <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{b.notes}</p>}
                <div className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-gray-50 dark:border-[#1e3a5f]/40">
                  {b.status === 'Pending' && (
                    <>
                      <button type="button" disabled={savingId === b.booking_id} onClick={() => changeStatus(b, 'Approved')} className="px-2.5 py-1 rounded bg-green-600 text-white text-[10px] font-bold min-h-[32px]">Approve</button>
                      <button type="button" disabled={savingId === b.booking_id} onClick={() => changeStatus(b, 'Rejected')} className="px-2.5 py-1 rounded border border-red-300 text-red-500 text-[10px] font-bold min-h-[32px]">Reject</button>
                    </>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => setDeleteTarget(b)} className="px-2.5 py-1 rounded text-red-400 text-[10px] font-bold">Delete</button>
                  )}
                </div>
              </div>
            )}
            empty={
              <EmptyState
                icon={<BsClipboardCheck />}
                title={filter === 'All' ? 'No bookings yet' : `No ${filter.toLowerCase()} bookings`}
                message={filter === 'All'
                  ? 'When a customer books a service it will show up here.'
                  : 'Try a different status filter to see other bookings.'}
              />
            }
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete booking?"
        message={deleteTarget ? `This permanently removes the ${deleteTarget.service_name} booking from ${deleteTarget.firstName || 'this customer'}. This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPage>
  )
}

export default AdminBookings
