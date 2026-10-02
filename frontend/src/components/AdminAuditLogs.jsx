import { useEffect, useState, useMemo } from 'react'
import supabase from '../lib/supabase'
import { apiGetAuth } from '../lib/api'
import { AdminPage, AdminTable, StatusPill, EmptyState } from './adminTheme'
import { BsClockHistory, BsSearch, BsArrowRepeat } from 'react-icons/bs'
import toast from 'react-hot-toast'
import CopyToClipboard from './CopyToClipboard'

const ACTION_KIND = {
  delete: 'danger',
  user_delete: 'danger',
  stepup_failed: 'danger',
  create: 'success',
  add: 'success',
  update: 'progress',
  edit: 'progress',
  status: 'progress',
  role: 'progress',
  role_change: 'progress',
  stepup_verified: 'success',
}

const ACTION_LABEL = {
  create: 'Created',
  add: 'Added',
  update: 'Updated',
  edit: 'Edited',
  delete: 'Deleted',
  status: 'Status Changed',
  role: 'Role Changed',
  role_change: 'Role Changed',
  user_delete: 'User Deleted',
  stepup_verified: 'Verification Passed',
  stepup_failed: 'Verification Failed',
}

const actionLabel = (action) => ACTION_LABEL[action] || action || '-'

const AdminAuditLogs = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const PAGE_SIZE = 20

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLogs() }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function fetchLogs() {
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const { items } = await apiGetAuth('/admin/audit-logs', token)
      setLogs(items || [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    let rows = [...logs]
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter((log) =>
        (log.action || '').toLowerCase().includes(q) ||
        (log.admin_email || '').toLowerCase().includes(q) ||
        (log.target || '').toLowerCase().includes(q) ||
        (log.details || '').toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [logs, search, sortKey, sortDir])

  function formatTimestamp(ts) {
    if (!ts) return '-'
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const columns = [
    { key: 'created_at', label: 'Timestamp', sortable: true, render: (log) => (
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">{formatTimestamp(log.created_at)}</span>
        <CopyToClipboard text={formatTimestamp(log.created_at)} label="" />
      </div>
    )},
    { key: 'admin_email', label: 'Admin', sortable: true, render: (log) => (
      <span className="font-medium text-gray-800 dark:text-slate-200">{log.admin_email || 'System'}</span>
    )},
    { key: 'action', label: 'Action', sortable: true, render: (log) => (
      <StatusPill kind={ACTION_KIND[log.action] || 'neutral'}>{actionLabel(log.action)}</StatusPill>
    )},
    { key: 'target', label: 'Activity', sortable: true, render: (log) => (
      <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{log.target || '-'}</span>
    )},
    { key: 'details', label: 'Details', sortable: true, render: (log) => (
      <span className="text-gray-500 dark:text-slate-500 text-xs max-w-[200px] truncate block" title={log.details || ''}>{log.details || '-'}</span>
    )},
  ]

  return (
    <AdminPage title="Audit Logs" subtitle="Track all admin actions across the system.">
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by admin, action, activity..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59]"
          />
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-sm transition"
        >
          <BsArrowRepeat className="h-4 w-4" /> Refresh
        </button>
      </div>

      <AdminTable
        columns={columns}
        rows={filtered}
        rowKey={(log) => log.id}
        loading={loading}
        colSpan={5}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        renderMobileCard={(log) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 shrink-0">Timestamp</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400">{formatTimestamp(log.created_at)}</span>
                <CopyToClipboard text={formatTimestamp(log.created_at)} label="" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 shrink-0">Admin</span>
              <span className="text-xs font-black uppercase text-gray-900 dark:text-slate-100">{log.admin_email || 'System'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 shrink-0">Action</span>
              <StatusPill kind={ACTION_KIND[log.action] || 'neutral'}>{actionLabel(log.action)}</StatusPill>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 shrink-0">Activity</span>
              <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400">{log.target || '-'}</span>
            </div>
            {log.details && (
              <div className="text-[10px] italic text-gray-500 dark:text-slate-400 pt-1 border-t border-gray-50 dark:border-[#1e3a5f]/50 truncate" title={log.details}>
                {log.details}
              </div>
            )}
          </div>
        )}
        empty={
          <EmptyState
            icon={<BsClockHistory />}
            title="No audit logs"
            message={search ? 'No logs match your search.' : 'Admin actions will be logged here.'}
          />
        }
      />
    </AdminPage>
  )
}

export default AdminAuditLogs
