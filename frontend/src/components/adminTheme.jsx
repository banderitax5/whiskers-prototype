import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
      <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end" role="navigation" aria-label="Pagination">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" className={navBtnClass}>Prev</button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="w-6 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[10px] sm:text-xs text-gray-400 dark:text-slate-500 select-none" aria-hidden="true">...</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} aria-label={`Go to page ${p}`} aria-current={p === page ? 'page' : undefined} className={pageBtnClass(p)}>{p}</button>
          )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page" className={navBtnClass}>Next</button>
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
                  aria-sort={c.sortable ? (sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={`py-3 px-4 lg:py-4 lg:px-5 ${c.className || ''} ${c.sortable ? 'cursor-pointer select-none hover:text-yellow-200' : ''}`}
                  onClick={c.sortable ? () => onSort && onSort(c.key) : undefined}
                  onKeyDown={c.sortable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort && onSort(c.key); } } : undefined}
                  tabIndex={c.sortable ? 0 : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable && (
                      sortKey === c.key
                        ? (sortDir === 'asc' ? <BsArrowUp className="text-[10px]" aria-hidden="true" /> : <BsArrowDown className="text-[10px]" aria-hidden="true" />)
                        : <BsChevronExpand className="text-[10px] opacity-40" aria-hidden="true" />
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

// Row-level dropdown (status / role pickers) portaled to document.body.
// The desktop table lives inside an `overflow-x-auto` wrapper, which also clips the
// vertical axis — so an absolutely-positioned menu on the last row would stretch the
// table and reveal a scrollbar. Portaling with fixed positioning keeps the menu
// overlapping the table with zero effect on table height.
// shared dropdown styling - every admin dropdown (row status menus, form
// selects) uses one trigger/panel/option look so the whole admin feels like
// one product
const SELECT_TRIGGER = "bg-white dark:bg-[#162d4a] text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-[#1e3a5f] rounded-lg text-[10px] font-black uppercase tracking-widest px-2 py-1.5 text-left focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-400 cursor-pointer flex items-center justify-between gap-1 disabled:opacity-50";
const SELECT_PANEL = "bg-white dark:bg-[#162d4a] border border-gray-200 dark:border-[#1e3a5f] rounded-lg shadow-lg overflow-hidden";
function selectOptionCls(active) {
  return `w-full text-left px-2 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-[#1e3a5f] ${active ? "text-[#0b2e59] dark:text-yellow-200 bg-gray-50 dark:bg-[#1e3a5f]/50" : "text-gray-700 dark:text-slate-300"}`;
}
const SELECT_CHEVRON = <svg className="w-2.5 h-2.5 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>;

export function AdminRowDropdown({ open, onToggle, onClose, value, options, onSelect, disabled }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const el = triggerRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const MENU_MAX = 220;
    // flip above the trigger when there is not enough room below
    const flip = window.innerHeight - r.bottom < MENU_MAX && r.top > MENU_MAX;
    setPos({
      left: r.left,
      width: r.width,
      ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });

    const menuEl = menuRef.current;
    if (menuEl) {
      const first = menuEl.querySelector('button');
      if (first) first.focus();
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); triggerRef.current?.focus(); return; }
      // keep Tab inside the menu while it is open
      if (e.key === 'Tab') {
        const items = menuEl ? Array.from(menuEl.querySelectorAll('button')) : [];
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        if (e.shiftKey && (idx <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && idx === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
      // ArrowUp/ArrowDown walk the option list
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuEl ? Array.from(menuEl.querySelectorAll('button')) : [];
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown'
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
        next.focus();
      }
    };
    // close when clicking anywhere outside the menu or the trigger
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      onClose();
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${value} — change status`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`w-[6rem] ${SELECT_TRIGGER}`}
      >
        <span className="truncate">{value}</span>
        {SELECT_CHEVRON}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Status options"
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 10000 }}
          className={SELECT_PANEL}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              data-value={opt}
              onClick={(e) => { e.stopPropagation(); onSelect(opt); }}
              className={selectOptionCls(opt === value)}
            >
              {opt}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// form-style dropdown with the same look as the row status menus. options are
// strings or { value, label, disabled }; the trigger shows the current label.
// onChange receives the raw value (not a DOM event).
export function AdminSelect({ value, options, onChange, disabled, ariaLabel, className = 'w-full', id }) {
  const opts = (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const current = opts.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const el = triggerRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const MENU_MAX = 240;
    const flip = window.innerHeight - r.bottom < MENU_MAX && r.top > MENU_MAX;
    setPos({
      left: r.left,
      width: Math.max(r.width, 160),
      ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
    const menuEl = menuRef.current;
    if (menuEl) {
      const active = menuEl.querySelector('[aria-selected="true"]') || menuEl.querySelector('button');
      if (active) active.focus();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === 'Tab') {
        const items = menuEl ? Array.from(menuEl.querySelectorAll('button')) : [];
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && idx === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuEl ? Array.from(menuEl.querySelectorAll('button')) : [];
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown'
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
        next.focus();
      }
    };
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || (typeof current?.label === 'string' ? current.label : 'Select an option')}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`w-full ${SELECT_TRIGGER}`}
      >
        <span className="truncate">{current?.label || value || '—'}</span>
        {SELECT_CHEVRON}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel || 'Options'}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 10000 }}
          className={SELECT_PANEL}
        >
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-value={o.value}
              disabled={o.disabled}
              onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false); triggerRef.current?.focus(); }}
              className={selectOptionCls(o.value === value)}
            >
              {o.label}
            </button>
          ))}
        </div>,
        document.body
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

export const btnPrimary = `${ACCENT} px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition`;

// secondary/quiet action next to btnPrimary (History, Restore defaults,
// Preview storefront, Discard) - kept here so every admin page uses one style
export const btnGhost = 'px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition whitespace-nowrap';

export function StatusPill({ kind = 'neutral', children }) {
  const map = {
    success: 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200',
    danger: 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200',
    progress: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200',
    warning: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200',
    info: 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200',
    neutral: 'bg-gray-100 text-gray-700 dark:bg-[#162d4a] dark:text-slate-300',
  };
  const dot = {
    success: 'bg-green-600 dark:bg-green-400',
    danger: 'bg-red-500 dark:bg-red-400',
    progress: 'bg-yellow-600 dark:bg-yellow-400',
    warning: 'bg-yellow-600 dark:bg-yellow-400',
    info: 'bg-blue-500 dark:bg-blue-400',
    neutral: 'bg-gray-500 dark:bg-slate-400',
  };
  const k = map[kind] ? kind : 'neutral';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize whitespace-nowrap ${map[k]}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot[k]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger = false, busy = false }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const prevFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    prevFocusRef.current = document.activeElement;
    cancelRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel?.(); return; }
      if (e.key !== 'Tab') return;
      // trap Tab inside the dialog between its focusable buttons
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement);
      if (e.shiftKey && idx <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
      else if (!e.shiftKey && idx === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocusRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="bg-white dark:bg-[#0f2137] border border-gray-200 dark:border-[#1e3a5f] rounded-xl shadow-2xl p-5 sm:p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="text-base sm:text-lg font-black uppercase tracking-wide text-gray-900 dark:text-slate-100 mb-2">{title}</h3>
        <p id="confirm-dialog-message" className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-5 sm:mb-6">{message}</p>
        <div className="flex justify-end gap-2 sm:gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#162d4a] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition disabled:opacity-60 disabled:cursor-not-allowed ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'
            }`}
          >
            {busy && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            )}
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
