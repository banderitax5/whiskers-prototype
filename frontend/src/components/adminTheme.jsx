import React, { useEffect } from 'react';
import { BsChevronExpand, BsArrowUp, BsArrowDown } from 'react-icons/bs';

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeDetection() {
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    let theme;
    if (saved === 'dark' || saved === 'light') {
      theme = saved;
    } else {
      theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, []);
}

const SURFACE = 'bg-white dark:bg-[#0f2137]';
const BORDER = 'border border-gray-200 dark:border-[#1e3a5f]';
const TEXT = 'text-gray-900 dark:text-gray-100';
const TEXT_DIM = 'text-gray-500 dark:text-slate-400';
const ACCENT = 'bg-yellow-400 hover:bg-yellow-500 text-gray-900 dark:text-gray-900';
const PULSE = 'bg-gray-200 dark:bg-[#162d4a] rounded animate-pulse';

function skeletonCount(pageSize) {
  return Math.min(pageSize || 10, 20);
}

function skeletonCell(col) {
  if (col.key === 'select') return <div className={`${PULSE} h-4 w-4`} />;
  if (col.key === 'actions') return <div className={`${PULSE} h-7 w-16`} />;
  if (col.key === 'img') return <div className={`${PULSE} h-9 w-9 rounded-lg`} />;
  if (col.key === 'status') return <div className={`${PULSE} h-5 w-16 rounded-full`} />;
  return <div className={`${PULSE} h-4 w-3/4`} />;
}

export function AdminPage({ title, subtitle, children }) {
  return (
    <div className={`p-3 sm:p-4 lg:p-6 ${TEXT}`}>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black uppercase tracking-wide text-[#0b2e59] dark:text-yellow-200">
          {title}
        </h1>
        {subtitle && <p className={`text-xs sm:text-sm ${TEXT_DIM} mt-1`}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value, loading }) {
  return (
    <div className={`${SURFACE} ${BORDER} p-3 sm:p-5 rounded-xl shadow-sm`}>
      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
        {label}
      </span>
      {loading ? (
        <div className={`${PULSE} h-6 sm:h-8 lg:h-9 w-16 mt-0.5 sm:mt-1`} aria-hidden="true" />
      ) : (
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black mt-0.5 sm:mt-1 text-[#0b2e59] dark:text-yellow-200 leading-tight">{value}</h2>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, rowsLength, pageSize, onPageChange }) {
  const getPageNumbers = () => {
    const pages = [];
    const delta = 1;
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);
    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };
  const [gotoVal, setGotoVal] = React.useState('');
  const handleGoto = (e) => {
    e.preventDefault();
    const p = parseInt(gotoVal, 10);
    if (p >= 1 && p <= totalPages && onPageChange) {
      onPageChange(p);
      setGotoVal('');
    }
  };
  const pageBtnClass = (p) =>
    `h-7 w-7 sm:h-8 sm:w-8 rounded-lg text-[10px] sm:text-xs font-black transition ${
      p === page
        ? 'bg-[#0b2e59] text-white'
        : 'border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a]'
    }`;
  const navBtnClass = `px-2 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] disabled:opacity-30 disabled:cursor-not-allowed transition`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-3 border-t border-gray-100 dark:border-[#1e3a5f]">
      <span className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rowsLength)} of {rowsLength}
      </span>
      <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={navBtnClass}>Prev</button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="w-6 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[10px] sm:text-xs text-gray-400 dark:text-slate-500 select-none">...</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} className={pageBtnClass(p)}>{p}</button>
          )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={navBtnClass}>Next</button>
        <form onSubmit={handleGoto} className="hidden sm:flex items-center gap-1 ml-2">
          <span className="text-[11px] text-gray-500 dark:text-slate-400 whitespace-nowrap">Go to:</span>
          <input
            type="text"
            value={gotoVal}
            onChange={(e) => setGotoVal(e.target.value)}
            className="w-10 h-7 sm:h-8 rounded-lg text-[10px] sm:text-xs text-center border border-gray-200 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-700 dark:text-slate-200 outline-none focus:border-[#0b2e59] dark:focus:border-yellow-200 transition"
            placeholder={page}
          />
          <button type="submit" className="px-1.5 h-7 sm:h-8 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider border border-gray-200 dark:border-[#1e3a5f] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition">Go</button>
        </form>
      </div>
    </div>
  );
}

export function AdminTable({ columns, rows, rowKey, loading, empty, colSpan, onRowClick, sortKey, sortDir, onSort, page, pageSize, onPageChange, renderMobileCard }) {
  const totalPages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  // deleting or filtering rows can leave `page` past the end, which would show an empty table over real data
  const current = Math.min(Math.max(1, page || 1), totalPages);
  const paginatedRows = pageSize ? rows.slice((current - 1) * pageSize, current * pageSize) : rows;

  const nonCheckboxColumns = columns.filter((c) => c.key !== 'select');
  const rowsToSkeleton = skeletonCount(pageSize);

  return (
    <div className={`${BORDER} ${SURFACE} shadow-sm rounded-xl overflow-hidden`}>
      <span role="status" className="sr-only">{loading ? 'Loading...' : ''}</span>
      {/* Mobile: clean card layout */}
      <div className="sm:hidden">
        {loading ? (
          <div className="divide-y divide-gray-100 dark:divide-[#1e3a5f]/60" aria-hidden="true">
            {Array.from({ length: rowsToSkeleton }).map((_, r) => (
              <div key={`sk-${r}`} className="px-3 py-3 space-y-1.5">
                <div className={`${PULSE} h-4 w-1/2`} />
                <div className={`${PULSE} h-3 w-1/3`} />
                <div className={`${PULSE} h-3 w-2/3`} />
              </div>
            ))}
          </div>
        ) : paginatedRows.length === 0 ? (
          <div className="p-0">{empty}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#1e3a5f]/60">
            {paginatedRows.map((row, i) => (
              <div
                key={rowKey ? rowKey(row, i) : i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`px-3 py-3 ${onRowClick ? 'cursor-pointer' : ''} active:bg-gray-50 dark:active:bg-[#162d4a]/50`}
              >
                {renderMobileCard ? (
                  renderMobileCard(row)
                ) : (
                  <div className="space-y-1">
                    {nonCheckboxColumns.slice(0, 1).map((c) => (
                      <div key={c.key} className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">
                        {c.render ? c.render(row) : row[c.key]}
                      </div>
                    ))}
                    {nonCheckboxColumns.slice(1, 3).map((c) => (
                      <div key={c.key} className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {c.render ? c.render(row) : row[c.key]}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="table w-full text-gray-900 dark:text-slate-200">
          <thead>
            <tr className="bg-[#0b2e59] text-yellow-300 uppercase text-[10px] font-black tracking-widest">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`py-3 px-4 lg:py-4 lg:px-5 ${c.className || ''} ${c.sortable ? 'cursor-pointer select-none hover:text-yellow-200' : ''}`}
                  onClick={c.sortable ? () => onSort && onSort(c.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable && (
                      sortKey === c.key
                        ? (sortDir === 'asc' ? <BsArrowUp className="text-[10px]" /> : <BsArrowDown className="text-[10px]" />)
                        : <BsChevronExpand className="text-[10px] opacity-40" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: rowsToSkeleton }).map((_, r) => (
                <tr key={`sk-${r}`} className="border-b border-gray-100 dark:border-[#1e3a5f]" aria-hidden="true">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-3 px-4 lg:py-4 lg:px-5 align-middle ${c.cellClassName || ''}`}>
                      {skeletonCell(c)}
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan || columns.length} className="p-0">{empty}</td>
              </tr>
            ) : (
              paginatedRows.map((row, i) => (
                <tr
                  key={rowKey ? rowKey(row, i) : i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-gray-100 dark:border-[#1e3a5f] hover:bg-yellow-50 dark:hover:bg-[#162d4a]/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`py-3 px-4 lg:py-4 lg:px-5 align-middle ${c.cellClassName || ''}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize && totalPages > 1 && (
        <Pagination page={current} totalPages={totalPages} rowsLength={rows.length} pageSize={pageSize} onPageChange={onPageChange} />
      )}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 sm:py-14 px-4 sm:px-6">
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 flex items-center justify-center text-[#0b2e59] dark:text-yellow-200 text-xl sm:text-3xl mb-3 sm:mb-4">
        {icon}
      </div>
      <h3 className="text-base sm:text-lg font-black uppercase tracking-wide text-[#0b2e59] dark:text-yellow-200">{title}</h3>
      <p className={`text-xs sm:text-sm ${TEXT_DIM} mt-1 max-w-sm`}>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm">
      {message}
    </div>
  );
}

export const btnPrimary = `${ACCENT} px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition`;
export const btnGhost = `bg-white hover:bg-gray-50 text-[#0b2e59] border border-gray-300 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition dark:bg-[#162d4a] dark:hover:bg-[#1e3a5f] dark:text-slate-200 dark:border-[#1e3a5f]`;

export function StatusPill({ kind = 'neutral', children }) {
  const map = {
    success: 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
    danger: 'bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
    progress: 'bg-yellow-100 text-gray-900 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-700',
    neutral: 'bg-gray-100 text-gray-700 border border-gray-300 dark:bg-[#162d4a] dark:text-slate-300 dark:border-[#1e3a5f]',
  };
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-center whitespace-nowrap overflow-hidden ${map[kind]}`}>
      {children}
    </span>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] rounded-xl shadow-2xl p-5 sm:p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base sm:text-lg font-black uppercase tracking-wide text-gray-900 dark:text-slate-100 mb-2">{title}</h3>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-5 sm:mb-6">{message}</p>
        <div className="flex justify-end gap-2 sm:gap-3">
          <button
            onClick={onCancel}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
