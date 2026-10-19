import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import supabase from '../lib/supabase'
import { apiGetAuth } from '../lib/api'
import { AdminPage, StatusPill, EmptyState, AdminSelect, btnGhost, btnPrimary } from './adminTheme'
import CopyToClipboard from './CopyToClipboard'
import {
  CATEGORIES, CATEGORY_PILL, describeEntry, humanizeField, maskValue, parseTarget,
} from '../lib/auditRegistry'
import {
  buildCsv, changeLines, createResolver, dayKey, downloadCsv, exactLabel, filterEntries,
  groupByDay, hasActiveFilters, relativeLabel, timeOnlyLabel, whoFor,
} from '../lib/auditView'
import {
  BsArrowClockwise, BsArrowRepeat, BsChevronDown, BsChevronRight, BsChevronUp, BsClockHistory,
  BsDownload, BsExclamationTriangle, BsSearch, BsShieldCheck,
} from 'react-icons/bs'

const PAGE_SIZE = 20

const RANGE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom dates' },
]

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...CATEGORIES.map((c) => ({ value: c, label: c })),
]

const SURFACE = 'bg-white dark:bg-[#0f2137]'
const BORDER = 'border border-gray-200 dark:border-[#1e3a5f]'

function FilterToggle({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest border transition ${
        on
          ? 'bg-[#0b2e59] text-white border-[#0b2e59] dark:bg-yellow-400 dark:text-gray-900 dark:border-yellow-400'
          : 'border-gray-300 dark:border-[#1e3a5f] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a]'
      }`}
    >
      {children}
    </button>
  )
}

function ImportantMarker() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-300 whitespace-nowrap">
      <BsExclamationTriangle className="h-3 w-3" aria-hidden="true" />
      Important
    </span>
  )
}

function EntryDetails({ e }) {
  const { parsed, row } = e
  // Phase B rows carry exact from -> to values in `changes`; they beat the
  // details-string parse when present. Older rows fall through to the parser.
  const structured = changeLines(row.changes)
  let changed
  if (structured.length) {
    changed = (
      <dl className="space-y-1">
        {structured.map((l) => (
          <div key={l.field} className="flex flex-wrap items-baseline gap-1 text-xs text-gray-700 dark:text-slate-300">
            <dt className="font-bold">{l.label}</dt>
            <dd>
              {l.from !== '—' ? (
                <>
                  {maskValue(l.label, l.from)} <span aria-hidden="true">→</span> {maskValue(l.label, l.to)}
                </>
              ) : (
                maskValue(l.label, l.to)
              )}
            </dd>
          </div>
        ))}
      </dl>
    )
  } else if (parsed.changes.length) {
    changed = (
      <dl className="space-y-1">
        {parsed.changes.map((c, i) => (
          <div key={`${c.field}-${i}`} className="flex flex-wrap items-baseline gap-1 text-xs text-gray-700 dark:text-slate-300">
            <dt className="font-bold">{humanizeField(c.field)}</dt>
            <dd>
              {c.from != null ? (
                <>
                  {maskValue(c.field, c.from)} <span aria-hidden="true">→</span> {maskValue(c.field, c.to)}
                </>
              ) : (
                maskValue(c.field, c.to)
              )}
            </dd>
          </div>
        ))}
      </dl>
    )
  } else if (parsed.fields.length) {
    changed = (
      <ul className="flex flex-wrap gap-1.5">
        {parsed.fields.map((f) => (
          <li key={f} className="rounded-full bg-gray-100 dark:bg-[#162d4a] px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-300">
            {humanizeField(f)}
          </li>
        ))}
      </ul>
    )
  } else if (parsed.summary) {
    changed = <p className="text-xs text-gray-700 dark:text-slate-300">{parsed.summary}</p>
  } else if (row.details) {
    changed = <p className="text-xs text-gray-700 dark:text-slate-300">{row.details}</p>
  } else {
    changed = <p className="text-xs italic text-gray-500 dark:text-slate-400">Details not recorded for this entry.</p>
  }
  const tech = [
    `action: ${row.action || '-'}`,
    `target: ${row.target || '-'}`,
    `details: ${row.details || '-'}`,
    row.changes ? `changes: ${JSON.stringify(row.changes)}` : null,
    `admin: ${row.admin_email || '-'}`,
    `id: ${row.id || '-'}`,
  ].filter(Boolean).join('\n')
  return (
    <div className="px-4 py-3 space-y-3 bg-gray-50 dark:bg-[#162d4a]/40 border-t border-gray-100 dark:border-[#1e3a5f]">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 min-w-0">
          <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">What changed</h4>
          {changed}
          <p className="text-[10px] text-gray-500 dark:text-slate-400">{exactLabel(row.created_at)} (Asia/Manila)</p>
        </div>
        <CopyToClipboard text={tech} label="Copy" />
      </div>
      <details className="text-[11px] text-gray-600 dark:text-slate-400">
        <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 select-none">
          Technical details
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
          <dt className="opacity-60">Action</dt>
          <dd className="break-all">{row.action || '-'}</dd>
          <dt className="opacity-60">Target</dt>
          <dd className="break-all">{row.target || '-'}</dd>
          {row.changes ? (
            <>
              <dt className="opacity-60">Changes</dt>
              <dd className="break-all">{JSON.stringify(row.changes)}</dd>
            </>
          ) : null}
          <dt className="opacity-60">Admin</dt>
          <dd className="break-all">{row.admin_email || '-'}</dd>
          <dt className="opacity-60">Entry ID</dt>
          <dd className="break-all">{row.id || '-'}</dd>
        </dl>
      </details>
    </div>
  )
}

function EntryChips({ e }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 mt-1">
      <StatusPill kind={CATEGORY_PILL[e.category] || 'neutral'}>{e.category}</StatusPill>
      {e.important && <ImportantMarker />}
    </span>
  )
}

function WhenCell({ e }) {
  const rel = relativeLabel(e.row.created_at)
  return (
    <time
      dateTime={e.row.created_at || undefined}
      title={exactLabel(e.row.created_at)}
      className="whitespace-nowrap text-xs text-gray-600 dark:text-slate-400"
    >
      {rel || timeOnlyLabel(e.row.created_at)}
    </time>
  )
}

const AdminAuditLogs = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionEmail, setSessionEmail] = useState(null)
  const [resolved, setResolved] = useState({ userName: () => null, productName: () => null })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState('desc')
  const [expandedId, setExpandedId] = useState(null)
  const [filters, setFilters] = useState({
    range: 'all', from: '', to: '', category: 'all', person: 'all',
    importantOnly: false, showSecurity: false,
  })

  const resolver = useMemo(() => createResolver(), [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      setSessionEmail(session?.user?.email || null)
      if (!token) {
        setLogs([])
        return
      }
      const { items } = await apiGetAuth('/admin/audit-logs?limit=500', token)
      const rows = items || []
      setLogs(rows)
      resolver.clear()
      const r = await resolver.resolve(rows, token)
      setResolved(() => r)
    } catch (err) {
      setError(err.message || 'Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [resolver])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const setFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  // search is separate input state; merge it so filtering sees both
  const activeFilters = useMemo(() => ({ ...filters, q: search }), [filters, search])

  const entries = useMemo(() => logs.map((row) => {
    const t = parseTarget(row.target)
    let label = null
    if (t.kind === 'user' && t.id) label = resolved.userName(t.id)
    if (t.kind === 'product' && t.id) label = resolved.productName(t.id)
    const who = whoFor(row.admin_email, sessionEmail, row.actor_name)
    return describeEntry(row, { who, label })
  }), [logs, sessionEmail, resolved])

  const filtered = useMemo(() => {
    const list = filterEntries(entries, activeFilters)
    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = new Date(a.row.created_at).getTime() || 0
      const bv = new Date(b.row.created_at).getTime() || 0
      return (av - bv) * dir
    })
  }, [entries, activeFilters, sortDir])

  const personOptions = useMemo(() => {
    const seen = new Map() // lowercased email -> display label (name when known)
    for (const row of logs) {
      const email = String(row.admin_email || '').toLowerCase()
      if (!email || email === 'unknown' || seen.has(email)) continue
      seen.set(email, row.actor_name || email)
    }
    return [
      { value: 'all', label: 'All people' },
      ...[...seen.entries()].map(([email, label]) => ({
        value: email,
        label: email === String(sessionEmail || '').toLowerCase() ? 'You' : label,
      })),
    ]
  }, [logs, sessionEmail])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, page), totalPages)
  const paged = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const groups = useMemo(() => groupByDay(paged), [paged])
  const filtersActive = hasActiveFilters(activeFilters)

  const toggleExpanded = (id) => setExpandedId((prev) => (prev === id ? null : id))

  function handleExport() {
    const csv = buildCsv(filtered)
    downloadCsv(`audit-log-${dayKey(new Date())}.csv`, csv)
  }

  return (
    <AdminPage title="Audit logs" subtitle="A readable history of changes made in the admin panel.">
      {error && !loading ? (
        <EmptyState
          icon={<BsExclamationTriangle />}
          title="Audit logs unavailable"
          message={error}
          action={
            <button type="button" onClick={fetchLogs} className={`inline-flex items-center gap-2 ${btnPrimary} min-h-[44px]`}>
              <BsArrowClockwise className="w-3.5 h-3.5" /> Retry
            </button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search what happened, people, targets..."
                aria-label="Search the audit log"
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#0b2e59]"
              />
            </div>
            <AdminSelect
              id="audit-range"
              className="w-auto min-w-[8rem]"
              value={filters.range}
              options={RANGE_OPTIONS}
              onChange={(v) => setFilter({ range: v })}
              ariaLabel="Date range"
            />
            {filters.range === 'custom' && (
              <>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
                  From
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilter({ from: e.target.value })}
                    aria-label="From date"
                    className="ml-1 w-auto rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-gray-800 dark:text-slate-200"
                  />
                </label>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
                  To
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilter({ to: e.target.value })}
                    aria-label="To date"
                    className="ml-1 w-auto rounded-lg border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-gray-800 dark:text-slate-200"
                  />
                </label>
              </>
            )}
            <AdminSelect
              id="audit-category"
              className="w-auto min-w-[9rem]"
              value={filters.category}
              options={CATEGORY_OPTIONS}
              onChange={(v) => setFilter({ category: v })}
              ariaLabel="Category"
            />
            <AdminSelect
              id="audit-person"
              className="w-auto min-w-[9rem]"
              value={filters.person}
              options={personOptions}
              onChange={(v) => setFilter({ person: v })}
              ariaLabel="Person"
            />
            <FilterToggle on={filters.importantOnly} onClick={() => setFilter({ importantOnly: !filters.importantOnly })}>
              Important only
            </FilterToggle>
            <FilterToggle on={filters.showSecurity} onClick={() => setFilter({ showSecurity: !filters.showSecurity })}>
              <span className="inline-flex items-center gap-1">
                <BsShieldCheck className="h-3 w-3" aria-hidden="true" /> Security checks
              </span>
            </FilterToggle>
            <button type="button" onClick={fetchLogs} className={btnGhost}>
              <span className="inline-flex items-center gap-1.5"><BsArrowRepeat className="h-3.5 w-3.5" aria-hidden="true" /> Refresh</span>
            </button>
            <button type="button" onClick={handleExport} disabled={filtered.length === 0} className={`${btnGhost} disabled:opacity-40`}>
              <span className="inline-flex items-center gap-1.5"><BsDownload className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV</span>
            </button>
            {logs.length >= 500 && (
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                Showing latest 500 actions
              </span>
            )}
          </div>

          <div className={`${BORDER} ${SURFACE} shadow-sm rounded-xl overflow-hidden`}>
            <span role="status" className="sr-only">{loading ? 'Loading audit log' : ''}</span>
            {loading ? (
              <div className="divide-y divide-gray-100 dark:divide-[#1e3a5f]/60" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, r) => (
                  <div key={r} className="px-4 py-3 space-y-1.5">
                    <div className="h-3 w-1/4 rounded bg-gray-200 dark:bg-[#162d4a] animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-[#162d4a] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<BsClockHistory />}
                title={filtersActive ? 'No actions match these filters' : 'No audit logs'}
                message={filtersActive ? 'Try a wider date range or clear the filters.' : 'Admin actions will be logged here.'}
                action={filtersActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({ range: 'all', from: '', to: '', category: 'all', person: 'all', importantOnly: false, showSecurity: false })
                      setSearch('')
                      setPage(1)
                    }}
                    className={btnGhost}
                  >
                    Clear filters
                  </button>
                ) : undefined}
              />
            ) : (
              <>
                {/* Mobile: day-grouped cards */}
                <div className="sm:hidden">
                  {groups.map((g) => (
                    <Fragment key={g.key}>
                      <div className="px-3 py-1.5 bg-gray-100 dark:bg-[#162d4a]/60 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-300">
                        {g.label}
                      </div>
                      {g.rows.map((e) => {
                        const open = expandedId === e.row.id
                        const panelId = `audit-m-${e.row.id}`
                        return (
                          <div key={e.row.id} className="border-b border-gray-100 dark:border-[#1e3a5f] last:border-b-0">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={panelId}
                              onClick={() => toggleExpanded(e.row.id)}
                              className="w-full text-left px-3 py-3 active:bg-gray-50 dark:active:bg-[#162d4a]/50"
                            >
                              <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-slate-400">
                                <WhenCell e={e} />
                                <span className="truncate">{e.who}</span>
                              </div>
                              <p className="text-sm text-gray-900 dark:text-slate-100 mt-1">{e.sentence}</p>
                              <EntryChips e={e} />
                            </button>
                            <div id={panelId}>
                              {open && <EntryDetails e={e} />}
                            </div>
                          </div>
                        )
                      })}
                    </Fragment>
                  ))}
                </div>

                {/* Desktop: semantic table with day groups */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-gray-900 dark:text-slate-200">
                    <caption className="sr-only">Audit log entries grouped by day</caption>
                    <thead>
                      <tr className="bg-[#0b2e59] text-yellow-300 uppercase text-[10px] font-black tracking-widest">
                        <th
                          scope="col"
                          aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'}
                          className="py-3 px-4 text-left w-32"
                        >
                          <button
                            type="button"
                            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                            className="inline-flex items-center gap-1 hover:text-yellow-200 uppercase font-black tracking-widest"
                          >
                            When
                            {sortDir === 'asc'
                              ? <BsChevronUp className="text-[10px]" aria-hidden="true" />
                              : <BsChevronDown className="text-[10px]" aria-hidden="true" />}
                          </button>
                        </th>
                        <th scope="col" className="py-3 px-4 text-left w-48">Who</th>
                        <th scope="col" className="py-3 px-4 text-left">What happened</th>
                        <th scope="col" className="py-3 px-4 text-left w-10"><span className="sr-only">Details</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <Fragment key={g.key}>
                          <tr>
                            <th
                              colSpan={4}
                              scope="colgroup"
                              className="bg-gray-100 dark:bg-[#162d4a]/60 text-left px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-300"
                            >
                              {g.label}
                            </th>
                          </tr>
                          {g.rows.map((e) => {
                            const open = expandedId === e.row.id
                            const panelId = `audit-d-${e.row.id}`
                            return (
                              <Fragment key={e.row.id}>
                                <tr className="border-b border-gray-100 dark:border-[#1e3a5f] hover:bg-yellow-50 dark:hover:bg-[#162d4a]/50 transition-colors align-top">
                                  <td className="py-3 px-4"><WhenCell e={e} /></td>
                                  <td className="py-3 px-4 text-xs font-medium text-gray-700 dark:text-slate-300 break-words">
                                    {e.who}
                                  </td>
                                  <td className="py-3 px-4">
                                    <p className="text-sm text-gray-900 dark:text-slate-100">{e.sentence}</p>
                                    <EntryChips e={e} />
                                  </td>
                                  <td className="py-3 px-4">
                                    <button
                                      type="button"
                                      aria-expanded={open}
                                      aria-controls={panelId}
                                      aria-label={open ? 'Hide details' : 'Show details'}
                                      onClick={() => toggleExpanded(e.row.id)}
                                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#162d4a] text-gray-500 dark:text-slate-400"
                                    >
                                      {open ? <BsChevronDown className="h-4 w-4" /> : <BsChevronRight className="h-4 w-4" />}
                                    </button>
                                  </td>
                                </tr>
                                {open && (
                                  <tr id={panelId}>
                                    <td colSpan={4} className="p-0">
                                      <EntryDetails e={e} />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 sm:py-3 border-t border-gray-100 dark:border-[#1e3a5f]">
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
                      <button
                        type="button"
                        onClick={() => setPage(current - 1)}
                        disabled={current <= 1}
                        aria-label="Previous page"
                        className={btnGhost}
                      >
                        Prev
                      </button>
                      <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 px-1">
                        Page {current} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage(current + 1)}
                        disabled={current >= totalPages}
                        aria-label="Next page"
                        className={btnGhost}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </AdminPage>
  )
}

export default AdminAuditLogs
