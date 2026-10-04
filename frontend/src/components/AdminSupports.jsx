import React, { useState, useEffect } from 'react'
import supabase from '../lib/supabase'
import { apiGetAllPages, apiPatchAuth } from '../lib/api'
import { AdminPage, AdminTable, EmptyState, StatCard, StatusPill } from './adminTheme'
import { BsChatDots, BsExclamationTriangle, BsArrowClockwise } from 'react-icons/bs'
import toast from 'react-hot-toast'

const AdminSupports = () => {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [replyTarget, setReplyTarget] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)
  const PAGE_SIZE = 10

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

  useEffect(() => {
    if (!replyTarget) return
    const onKey = (e) => { if (e.key === 'Escape') setReplyTarget(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [replyTarget])

  function openReply(c) {
    setReplyTarget(c)
    setReplyText(c.response || '')
  }

  async function saveReply() {
    const text = replyText.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Your session has expired. Sign in again.')
      await apiPatchAuth(`/admin/supports/${replyTarget.support_id}`, { response: text }, session.access_token)
      setCases((prev) => prev.map((c) => c.support_id === replyTarget.support_id ? { ...c, response: text } : c))
      toast.success('Reply sent')
      setReplyTarget(null)
    } catch (err) {
      if (err.message !== 'Verification cancelled') toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const waiting = cases.filter((c) => !c.response).length
  const replied = cases.length - waiting

  const formatDate = (ts) => ts
    ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-'

  const columns = [
    { key: 'customer', label: 'Customer',
      render: (c) => <span className="font-black uppercase text-sm tracking-wide text-gray-900 dark:text-slate-100">{`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'}</span>,
    },
    { key: 'message', label: 'Message',
      render: (c) => <span className="text-sm text-gray-700 dark:text-slate-300 line-clamp-2 max-w-[280px]" title={c.message}>{c.message}</span>,
    },
    { key: 'date_submitted', label: 'Sent',
      render: (c) => <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(c.date_submitted)}</span>,
    },
    { key: 'status', label: 'Status',
      render: (c) => <StatusPill kind={c.response ? 'success' : 'progress'}>{c.response ? 'Replied' : 'Awaiting reply'}</StatusPill>,
    },
    { key: 'actions', label: '', sortable: false,
      render: (c) => (
        <button
          type="button"
          onClick={() => openReply(c)}
          className="px-3 py-1.5 rounded-lg bg-[#0b2e59] dark:bg-yellow-600 text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-500 transition min-h-[36px]"
        >
          {c.response ? 'Edit reply' : 'Reply'}
        </button>
      ),
    },
  ]

  return (
    <AdminPage title="Customer Support" subtitle="Cases sent by customers and the replies you send back.">

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard label="Total Cases" value={cases.length} loading={loading} />
        <StatCard label="Awaiting Reply" value={waiting} loading={loading} />
        <StatCard label="Replied" value={replied} loading={loading} />
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
        <AdminTable
          columns={columns}
          rows={cases}
          rowKey={(c) => c.support_id}
          loading={loading}
          colSpan={5}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          renderMobileCard={(c) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'}</span>
                <StatusPill kind={c.response ? 'success' : 'progress'}>{c.response ? 'Replied' : 'Awaiting reply'}</StatusPill>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-3">{c.message}</p>
              <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-gray-50 dark:border-[#1e3a5f]/40">
                <span className="text-[10px] text-gray-500 dark:text-slate-400">{formatDate(c.date_submitted)}</span>
                <button type="button" onClick={() => openReply(c)} className="px-2.5 py-1 rounded bg-[#0b2e59] text-white text-[10px] font-bold min-h-[32px]">
                  {c.response ? 'Edit reply' : 'Reply'}
                </button>
              </div>
            </div>
          )}
          empty={
            <EmptyState
              icon={<BsChatDots />}
              title="No support cases yet"
              message="When a customer sends a message from the Support page it will show up here."
            />
          }
        />
      )}

      {replyTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setReplyTarget(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Reply to support case"
            className="bg-white dark:bg-[#0f2847] rounded-xl shadow-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reply to {`${replyTarget.firstName || ''} ${replyTarget.lastName || ''}`.trim() || 'customer'}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Sent {formatDate(replyTarget.date_submitted)}</p>
              </div>
              <button type="button" onClick={() => setReplyTarget(null)} className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-500 dark:text-slate-400 transition" aria-label="Close reply dialog">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 dark:bg-[#162d4a] rounded-lg p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Customer message</p>
                <p className="text-sm text-gray-800 dark:text-slate-200 whitespace-pre-wrap break-words">{replyTarget.message}</p>
              </div>
              <div>
                <label htmlFor="support-reply" className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">Your reply</label>
                <textarea
                  id="support-reply"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  autoFocus
                  placeholder="Write your reply to the customer..."
                  className="w-full rounded-lg border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-900 dark:text-slate-100 text-sm p-3 focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-200 resize-y"
                />
                <span className="block text-right text-[11px] text-gray-500 dark:text-slate-400 mt-1">{replyText.length}/2000</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-[#1e3a5f]">
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveReply}
                disabled={!replyText.trim() || saving}
                className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-40 min-h-[40px]"
              >
                {saving ? 'Sending...' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  )
}

export default AdminSupports
