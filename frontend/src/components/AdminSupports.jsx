import React, { useState, useEffect, useMemo, useRef } from 'react'
import supabase from '../lib/supabase'
import { apiGetAllPages, apiGetAuth, apiPatchAuth } from '../lib/api'
import { AdminPage, AdminTable, EmptyState, StatCard, StatusPill } from './adminTheme'

const SUPPORT_HELP = [
  { title: 'What this page shows', body: 'Messages customers sent through the support form, and the replies you send back.' },
  { title: 'Opening a case', body: 'Click a case to read it. Type in Your reply, then send it.' },
  { title: 'Status and priority', body: 'Set Status to show where a case is, and Priority to show what to answer first. Assignee is the team member email on the case.' },
  { title: 'Finding cases', body: 'Search by name, email or message, or use the filters (status, dates, customer). Clear filters resets them.' },
]
import { BsChatDots, BsExclamationTriangle, BsArrowClockwise, BsSearch } from 'react-icons/bs'
import toast from '../lib/toast.js'

const MAX_LEN = 2000
const WAIT_THRESHOLD_HOURS = 24
const DRAFT_KEY = (id) => `support-draft:${id}`

const customerName = (c) => `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'

const formatDate = (ts) => ts
  ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-'

// "2 hours ago" for quick scanning; after one week the actual date is shown
// instead. The full date is always shown on hover.
function relativeTime(ts) {
  if (!ts) return '-'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days >= 7) {
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const RelTime = ({ ts }) => (
  <time dateTime={ts || undefined} title={formatDate(ts)} className="text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">
    {relativeTime(ts)}
  </time>
)

// quick-insert replies for common cases; staff can still edit the text after inserting
const CANNED_REPLIES = [
  { label: 'Thanks for reaching out', text: 'Hi {name}, thank you for reaching out to us. We have received your message and will get back to you shortly.' },
  { label: 'Order status', text: 'Hi {name}, thanks for your message. Your order is being prepared and we will update you as soon as it ships.' },
  { label: 'Need more details', text: 'Hi {name}, thanks for contacting us. Could you share more details so we can help you better?' },
  { label: 'Resolved', text: 'Hi {name}, thanks for your patience. This has now been resolved. Let us know if you need anything else.' },
]

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]))

const STATUS_OPTIONS = [{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }]
const PRIORITY_OPTIONS = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]
const TAG_OPTIONS = ['Refund', 'Urgent', 'Billing', 'Shipping', 'Account']

const isWaiting = (c) => !c.response && c.status !== 'resolved'
const hoursWaiting = (c) => (Date.now() - new Date(c.date_submitted).getTime()) / 3600000

const AdminSupports = () => {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | waiting | replied | resolved | overdue
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [sort, setSort] = useState({ key: 'date_submitted', dir: 'desc' })

  const [replyTarget, setReplyTarget] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [staffEmails, setStaffEmails] = useState([])
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const textareaRef = useRef(null)
  const PAGE_SIZE = 10

  // staff emails for the assignee suggestions; failure just means no suggestions
  useEffect(() => {
    let cancelled = false
    async function loadStaff() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { items } = await apiGetAuth('/admin/staff-emails', session.access_token)
        if (!cancelled) setStaffEmails(items || [])
      } catch { /* no suggestions */ }
    }
    loadStaff()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Your session has expired. Sign in again.')
        const { items } = await apiGetAllPages('/admin/supports', session.access_token)
        if (!cancelled) setCases(items || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadKey])

  // reset to page 1 whenever the visible set changes
  useEffect(() => { setPage(1) }, [search, statusFilter, dateFrom, dateTo, customerFilter])

  const originalReply = replyTarget?.response || ''
  const isDirty = replyText.trim() !== originalReply.trim()
  const trimmed = replyText.trim()
  const canSend = trimmed.length > 0 && isDirty && !saving
  const isEdit = !!replyTarget?.response

  function requestClose() {
    if (saving) return
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return
    if (replyTarget && isDirty) localStorage.setItem(DRAFT_KEY(replyTarget.support_id), replyText)
    setReplyTarget(null)
  }

  useEffect(() => {
    if (!replyTarget) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); requestClose() }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveReply() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // focus the textarea when the modal opens
  useEffect(() => {
    if (replyTarget) textareaRef.current?.focus()
  }, [replyTarget])

  // keep Tab and Shift+Tab inside the dialog while it is open
  const dialogRef = useRef(null)
  useEffect(() => {
    if (!replyTarget) return
    const onTab = (e) => {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), textarea, input, select, [href]'))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onTab)
    return () => document.removeEventListener('keydown', onTab)
  }, [replyTarget])

  function insertCanned(text) {
    const name = replyTarget ? (replyTarget.firstName || 'there') : 'there'
    const filled = text.replace('{name}', name)
    setReplyText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${filled}` : filled))
    textareaRef.current?.focus()
  }

  // save status, priority, tags or assignee for one case, without sending a reply
  async function saveDetails(supportId, changes) {
    const prev = cases.find((c) => c.support_id === supportId)
    setCases((list) => list.map((c) => c.support_id === supportId ? { ...c, ...changes } : c))
    setReplyTarget((t) => (t && t.support_id === supportId ? { ...t, ...changes } : t))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Your session has expired. Sign in again.')
      await apiPatchAuth(`/admin/supports/${supportId}`, changes, session.access_token)
    } catch (err) {
      // put the old values back if the save failed
      if (prev) setCases((list) => list.map((c) => c.support_id === supportId ? { ...c, ...pick(prev, Object.keys(changes)) } : c))
      if (err.message !== 'Verification cancelled') toast.error(err.message || 'Could not save the change')
    }
  }

  function commitAssignee(value) {
    const v = value.trim()
    if ((replyTarget?.assignee_email || '') !== v) saveDetails(replyTarget.support_id, { assignee_email: v || null })
  }

  function openReply(c) {
    setAssigneeDraft(c.assignee_email || '')
    setAssigneeOpen(false)
    setReplyTarget(c)
    const draft = localStorage.getItem(DRAFT_KEY(c.support_id))
    setReplyText(draft ?? (c.response || ''))
  }

  async function saveReply() {
    if (!canSend) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Your session has expired. Sign in again.')
      const { item } = await apiPatchAuth(`/admin/supports/${replyTarget.support_id}`, { response: trimmed }, session.access_token)
      const saved = {
        response: trimmed,
        responded_at: item?.responded_at ?? new Date().toISOString(),
        responded_by: item?.responded_by ?? null,
      }
      setCases((prev) => prev.map((c) => c.support_id === replyTarget.support_id ? { ...c, ...saved } : c))
      localStorage.removeItem(DRAFT_KEY(replyTarget.support_id))
      toast.success(isEdit ? 'Reply updated' : 'Reply sent')
      setReplyTarget(null)
    } catch (err) {
      if (err.message !== 'Verification cancelled') toast.error(err.message || 'Could not send the reply')
    } finally {
      setSaving(false)
    }
  }

  // derived lists -------------------------------------------------------------
  const waiting = cases.filter(isWaiting).length
  const replied = cases.length - waiting
  const overdue = cases.filter((c) => isWaiting(c) && hoursWaiting(c) > WAIT_THRESHOLD_HOURS).length

  const avgResponseHours = useMemo(() => {
    const times = cases.filter((c) => c.response && c.responded_at && c.date_submitted)
      .map((c) => (new Date(c.responded_at) - new Date(c.date_submitted)) / 3600000)
      .filter((h) => h >= 0)
    if (!times.length) return null
    return times.reduce((a, b) => a + b, 0) / times.length
  }, [cases])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const from = dateFrom ? new Date(dateFrom).getTime() : null
    const to = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null
    const cust = customerFilter.trim().toLowerCase()
    let list = cases.filter((c) => {
      if (statusFilter === 'waiting' && !isWaiting(c)) return false
      if (statusFilter === 'replied' && (isWaiting(c) || c.status === 'resolved')) return false
      if (statusFilter === 'resolved' && c.status !== 'resolved') return false
      if (statusFilter === 'overdue' && !(isWaiting(c) && hoursWaiting(c) > WAIT_THRESHOLD_HOURS)) return false
      const t = new Date(c.date_submitted).getTime()
      if (from && t < from) return false
      if (to && t > to) return false
      if (cust && !customerName(c).toLowerCase().includes(cust) && !(c.email || '').toLowerCase().includes(cust)) return false
      if (q) {
        const hay = `${customerName(c)} ${c.email || ''} ${c.message || ''} ${c.support_id}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = (c) => {
      switch (sort.key) {
        case 'customer': return customerName(c).toLowerCase()
        case 'status': return isWaiting(c) && c.status !== 'resolved' ? 0 : 1
        default: return new Date(c.date_submitted).getTime()
      }
    }
    list = [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir)
    return list
  }, [cases, search, statusFilter, dateFrom, dateTo, customerFilter, sort])

  const filtersActive = search || statusFilter !== 'all' || dateFrom || dateTo || customerFilter

  function clearFilters() {
    setSearch(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setCustomerFilter('')
  }

  function toggleSort(key) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const sortLabel = (key, label) => (
    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 font-black uppercase tracking-widest">
      {label}
      <span aria-hidden="true" className={sort.key === key ? 'text-yellow-300' : 'text-yellow-300 opacity-50'}>{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )

  const columns = [
    { key: 'case', label: 'Case',
      render: (c) => <span className="text-xs font-mono text-gray-600 dark:text-slate-300">#{c.support_id?.slice(0, 8).toUpperCase()}</span>,
    },
    { key: 'customer', label: sortLabel('customer', 'Customer'),
      render: (c) => (
        <div className="flex flex-col">
          <span className="font-bold text-sm text-gray-900 dark:text-slate-100">{customerName(c)}</span>
          {c.email && <span className="text-xs text-gray-600 dark:text-slate-300 break-all">{c.email}</span>}
        </div>
      ),
    },
    { key: 'message', label: 'Message',
      render: (c) => <span className="text-sm text-gray-700 dark:text-slate-300 line-clamp-2 max-w-[280px]" title={c.message}>{c.message}</span>,
    },
    { key: 'date_submitted', label: sortLabel('date_submitted', 'Sent'),
      render: (c) => <RelTime ts={c.date_submitted} />,
    },
    { key: 'status', label: sortLabel('status', 'Status'),
      render: (c) => isWaiting(c)
        ? <div className="inline-flex"><StatusPill kind="progress">Awaiting reply</StatusPill></div>
        : <div className="flex flex-col items-start gap-0.5">
            <div className="inline-flex">
              {c.status === 'resolved'
                ? <StatusPill kind="success">Resolved</StatusPill>
                : <StatusPill kind="success">Replied</StatusPill>}
            </div>
            {c.responded_at && (
              <span className="text-[11px] text-gray-600 dark:text-slate-300 whitespace-nowrap" title={formatDate(c.responded_at)}>
                {relativeTime(c.responded_at)}{c.responded_by ? ` by ${c.responded_by}` : ''}
              </span>
            )}
          </div>,
    },
    { key: 'priority', label: 'Priority',
      render: (c) => {
        const p = c.priority || 'normal'
        const tone = p === 'high' ? 'text-red-700 dark:text-red-300' : p === 'low' ? 'text-gray-600 dark:text-slate-300' : 'text-gray-800 dark:text-slate-200'
        return <span className={`text-xs font-bold uppercase tracking-wide ${tone}`}>{PRIORITY_OPTIONS.find((o) => o.value === p)?.label || 'Normal'}</span>
      },
    },
    { key: 'tags', label: 'Tags',
      render: (c) => (c.tags?.length
        ? <div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#1e3a5f] text-[11px] font-semibold text-gray-800 dark:text-slate-200">{t}</span>)}</div>
        : <span className="text-xs text-gray-500 dark:text-slate-400">-</span>
      ),
    },
    { key: 'actions', label: '', sortable: false,
      render: (c) => (
        <button
          type="button"
          onClick={() => openReply(c)}
          aria-label={`${isWaiting(c) ? 'Reply to' : 'Update reply for'} ${customerName(c)}`}
          className="px-3 py-1.5 rounded-lg bg-[#0b2e59] dark:bg-yellow-600 text-white dark:text-gray-900 text-[11px] font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-500 transition min-h-[36px]"
        >
          {isWaiting(c) ? 'Reply' : 'Update reply'}
        </button>
      ),
    },
  ]

  // suggestions: staff emails that contain what the user has typed so far
  const assigneeQuery = assigneeDraft.trim().toLowerCase()
  const assigneeMatches = staffEmails.filter((e) => !assigneeQuery || e.toLowerCase().includes(assigneeQuery)).slice(0, 8)

  const remaining = Math.max(0, MAX_LEN - replyText.length)
  const counterCls = remaining <= 0 ? 'text-red-600 dark:text-red-400 font-bold'
    : remaining <= 200 ? 'text-amber-600 dark:text-amber-400 font-bold'
    : 'text-gray-600 dark:text-slate-300'

  return (
    <AdminPage title="Customer Support" subtitle="Cases sent by customers and the replies you send back." help={SUPPORT_HELP}>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <StatCard label="Total Cases" value={cases.length} loading={loading} />
        <button type="button" onClick={() => setStatusFilter('waiting')} className="text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2e59]" aria-label="Show cases awaiting reply">
          <StatCard label="Awaiting Reply" value={waiting} loading={loading} />
        </button>
        <button type="button" onClick={() => setStatusFilter('overdue')} className="text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2e59]" aria-label={`Show cases waiting over ${WAIT_THRESHOLD_HOURS} hours`}>
          <StatCard label={`Waiting > ${WAIT_THRESHOLD_HOURS}h`} value={overdue} loading={loading} />
        </button>
        <StatCard label="Avg Response" value={avgResponseHours == null ? '-' : avgResponseHours < 1 ? `${Math.round(avgResponseHours * 60)} min` : `${avgResponseHours.toFixed(1)} h`} loading={loading} />
      </div>

      {!loading && error && cases.length === 0 ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Support cases unavailable"
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
              <label htmlFor="support-search" className="sr-only">Search cases</label>
              <BsSearch aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
              <input
                id="support-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or message..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-300 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 text-sm focus:outline-none focus:border-[#0b2e59]"
              />
            </div>
            <div>
              <label htmlFor="support-status" className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">Status</label>
              <select id="support-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="py-2 px-3 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-300 dark:border-[#1e3a5f] text-sm text-gray-900 dark:text-slate-100">
                <option value="all">All</option>
                <option value="waiting">Awaiting reply</option>
                <option value="replied">Replied</option>
                <option value="resolved">Resolved</option>
                <option value="overdue">Waiting over {WAIT_THRESHOLD_HOURS}h</option>
              </select>
            </div>
            <div>
              <label htmlFor="support-from" className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">From</label>
              <input id="support-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="py-2 px-3 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-300 dark:border-[#1e3a5f] text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="support-to" className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">To</label>
              <input id="support-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="py-2 px-3 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-300 dark:border-[#1e3a5f] text-sm text-gray-900 dark:text-slate-100" />
            </div>
            <div>
              <label htmlFor="support-customer" className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">Customer</label>
              <input id="support-customer" type="text" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="Name or email" className="py-2 px-3 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-300 dark:border-[#1e3a5f] text-sm text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400" />
            </div>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="py-2 px-3 text-xs font-bold text-[#0b2e59] dark:text-yellow-200 underline underline-offset-2">Clear filters</button>
            )}
          </div>

          <p className="text-sm text-gray-700 dark:text-slate-200 mb-2" aria-live="polite">
            Showing {visible.length} of {cases.length} case{cases.length === 1 ? '' : 's'}
          </p>

          <AdminTable
            columns={columns}
            rows={visible}
            rowKey={(c) => c.support_id}
            loading={loading}
            colSpan={columns.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            renderMobileCard={(c) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{customerName(c)}</span>
                  {isWaiting(c)
                    ? <StatusPill kind="progress">Awaiting reply</StatusPill>
                    : <StatusPill kind="success">{c.status === 'resolved' ? 'Resolved' : 'Replied'}</StatusPill>}
                </div>
                {c.email && <p className="text-xs text-gray-600 dark:text-slate-300 break-all">{c.email}</p>}
                <p className="text-xs text-gray-700 dark:text-slate-300 line-clamp-3">{c.message}</p>
                {c.response && c.responded_at && (
                  <p className="text-[11px] text-gray-600 dark:text-slate-300">Replied {relativeTime(c.responded_at)}{c.responded_by ? ` by ${c.responded_by}` : ''}</p>
                )}
                <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-gray-100 dark:border-[#1e3a5f]/40">
                  <RelTime ts={c.date_submitted} />
                  <button type="button" onClick={() => openReply(c)} className="px-2.5 py-1 rounded bg-[#0b2e59] text-white text-[11px] font-bold min-h-[32px]">
                    {isWaiting(c) ? 'Reply' : 'Update reply'}
                  </button>
                </div>
              </div>
            )}
            empty={
              cases.length === 0 ? (
                <EmptyState
                  icon={<BsChatDots />}
                  title="No support cases yet"
                  message="When a customer sends a message from the Support page it will show up here."
                />
              ) : (
                <EmptyState
                  icon={<BsSearch />}
                  title="No cases match these filters"
                  message="Try a different search or clear the filters."
                  action={
                    <button type="button" onClick={clearFilters} className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition">
                      Clear filters
                    </button>
                  }
                />
              )
            }
          />
        </>
      )}

      {replyTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={requestClose}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-reply-title"
            className="bg-white dark:bg-[#0f2847] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <div>
                <h3 id="support-reply-title" className="text-lg font-bold text-gray-900 dark:text-white">
                  {isEdit ? 'Update reply' : 'Reply'} to {customerName(replyTarget)}
                </h3>
                <p className="text-xs text-gray-700 dark:text-slate-300">
                  {replyTarget.email && <>{replyTarget.email} · </>}Sent {formatDate(replyTarget.date_submitted)}
                </p>
              </div>
              <button type="button" onClick={requestClose} className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-600 dark:text-slate-300 transition" aria-label="Close reply dialog">
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              <div className="bg-gray-50 dark:bg-[#162d4a] rounded-lg p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-slate-300 mb-1">Customer message</p>
                <p className="text-sm text-gray-900 dark:text-slate-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{replyTarget.message}</p>
              </div>
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label htmlFor="support-status" className="block text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-slate-300 mb-1">Status</label>
                    <select
                      id="support-status"
                      value={replyTarget.status || 'open'}
                      onChange={(e) => saveDetails(replyTarget.support_id, { status: e.target.value })}
                      className="w-full rounded-md border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#0b2e59] px-2 py-1.5 text-sm text-gray-900 dark:text-slate-100"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} disabled={o.value === 'resolved' && isWaiting(replyTarget)}>
                          {o.label}{o.value === 'resolved' && isWaiting(replyTarget) ? ' (reply first)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="support-priority" className="block text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-slate-300 mb-1">Priority</label>
                    <select
                      id="support-priority"
                      value={replyTarget.priority || 'normal'}
                      onChange={(e) => saveDetails(replyTarget.support_id, { priority: e.target.value })}
                      className="w-full rounded-md border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#0b2e59] px-2 py-1.5 text-sm text-gray-900 dark:text-slate-100"
                    >
                      {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="support-assignee" className="block text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-slate-300 mb-1">Assignee (email)</label>
                    <div className="relative">
                      <input
                        id="support-assignee"
                        type="email"
                        autoComplete="off"
                        value={assigneeDraft}
                        onChange={(e) => { setAssigneeDraft(e.target.value); setAssigneeOpen(true) }}
                        onFocus={() => setAssigneeOpen(true)}
                        onBlur={() => {
                          setTimeout(() => setAssigneeOpen(false), 150)
                          commitAssignee(assigneeDraft)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitAssignee(assigneeDraft); setAssigneeOpen(false) }
                        }}
                        placeholder="Unassigned"
                        aria-autocomplete="list"
                        aria-controls="support-assignee-list"
                        className="w-full rounded-md border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#0b2e59] px-2 py-1.5 text-sm text-gray-900 dark:text-slate-100"
                      />
                      {assigneeOpen && assigneeMatches.length > 0 && (
                        <ul
                          id="support-assignee-list"
                          role="listbox"
                          className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#0b2e59] shadow-lg"
                        >
                          {assigneeMatches.map((e) => (
                            <li key={e} role="option" aria-selected={e === assigneeDraft}>
                              <button
                                type="button"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => { setAssigneeDraft(e); commitAssignee(e); setAssigneeOpen(false) }}
                                className="w-full text-left px-2 py-1.5 text-sm text-gray-900 dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] break-all"
                              >
                                {e}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mb-4" role="group" aria-label="Tags">
                  <span className="block text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-slate-300 mb-1">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TAG_OPTIONS.map((t) => {
                      const on = (replyTarget.tags || []).includes(t)
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const next = on ? replyTarget.tags.filter((x) => x !== t) : [...(replyTarget.tags || []), t]
                            saveDetails(replyTarget.support_id, { tags: next })
                          }}
                          className={`px-2 py-1 rounded-md text-[11px] font-bold border transition ${on ? 'bg-yellow-300 border-yellow-300 text-[#0b2e59]' : 'border-gray-300 dark:border-[#1e3a5f] text-gray-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#1e3a5f]'}`}
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <label htmlFor="support-reply" className="block text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-slate-300">Your reply</label>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert a canned reply">
                    {CANNED_REPLIES.map((r) => (
                      <button
                        key={r.label}
                        type="button"
                        onClick={() => insertCanned(r.text)}
                        className="px-2 py-1 rounded-md text-[11px] font-bold border border-gray-300 dark:border-[#1e3a5f] text-gray-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="support-reply"
                  ref={textareaRef}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  maxLength={MAX_LEN}
                  rows={5}
                  aria-describedby="support-reply-help"
                  placeholder="Write your reply to the customer..."
                  className="w-full rounded-lg border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-900 dark:text-slate-100 text-sm p-3 focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-200 resize-y"
                />
                <div className="flex justify-between gap-2 mt-1">
                  <span id="support-reply-help" className="text-[11px] text-gray-700 dark:text-slate-300">
                    {isEdit ? 'Saving emails the customer the updated reply.' : 'Sending emails the reply to the customer.'} Ctrl/Cmd+Enter to send.
                  </span>
                  <span className={`text-[11px] whitespace-nowrap ${counterCls}`}>{replyText.length}/{MAX_LEN}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-[#1e3a5f]">
              <button
                type="button"
                onClick={requestClose}
                className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveReply}
                disabled={!canSend}
                aria-busy={saving}
                className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-[11px] font-black uppercase tracking-widest transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
              >
                {saving ? 'Saving...' : isEdit ? 'Update reply' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  )
}

export default AdminSupports
