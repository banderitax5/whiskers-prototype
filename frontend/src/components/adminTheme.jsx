import React from 'react';
import { BsChevronExpand, BsArrowUp, BsArrowDown } from 'react-icons/bs';

// Admin theme that matches the homepage look:
//   light/white surface, yellow (#facc15) primary accent, navy (#0b2e59) headers
//   green for positive states, red for negative states only

const SURFACE = 'bg-white';
const SURFACE_PANEL = 'bg-gray-50';
const SURFACE_NAVY = 'bg-[#0b2e59]';
const BORDER = 'border border-gray-200';
const TEXT = 'text-gray-900';
const TEXT_DIM = 'text-gray-500';
const ACCENT = 'bg-yellow-400 hover:bg-yellow-500 text-gray-900';
const ACCENT_SOFT = 'bg-yellow-100 text-gray-900';

export function AdminPage({ title, subtitle, children }) {
  return (
    <div className={`p-4 sm:p-6 ${TEXT}`}>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wide text-[#0b2e59]">
          {title}
        </h1>
        {subtitle && <p className={`text-sm ${TEXT_DIM} mt-1`}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value }) {
  return (
    <div className={`${SURFACE} ${BORDER} p-5 rounded-xl shadow-sm`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <h2 className="text-3xl font-black mt-1 text-[#0b2e59]">{value}</h2>
    </div>
  );
}

export function AdminTable({ columns, rows, rowKey, loading, empty, colSpan, onRowClick, sortKey, sortDir, onSort }) {
  return (
    <div className={`overflow-x-auto rounded-xl ${BORDER} ${SURFACE} shadow-sm`}>
      <table className="table w-full text-gray-900">
        <thead>
          <tr className="bg-[#0b2e59] text-yellow-300 uppercase text-[10px] font-black tracking-widest">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`py-4 px-5 ${c.className || ''} ${c.sortable ? 'cursor-pointer select-none hover:text-yellow-200' : ''}`}
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
            <tr>
              <td colSpan={colSpan || columns.length} className="text-center py-12 text-gray-400">
                <span className="inline-block w-4 h-4 border-2 border-[#0b2e59] border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan || columns.length} className="p-0">{empty}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-gray-100 hover:bg-yellow-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`py-4 px-5 align-middle ${c.cellClassName || ''}`}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-16 h-16 rounded-full bg-yellow-100 border border-yellow-300 flex items-center justify-center text-[#0b2e59] text-3xl mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-black uppercase tracking-wide text-[#0b2e59]">{title}</h3>
      <p className={`text-sm ${TEXT_DIM} mt-1 max-w-sm`}>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm">
      {message}
    </div>
  );
}

export const btnPrimary = `${ACCENT} px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition`;
export const btnGhost = `bg-white hover:bg-gray-50 text-[#0b2e59] border border-gray-300 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition`;

export function StatusPill({ kind = 'neutral', children }) {
  const map = {
    success: 'bg-green-100 text-green-800 border border-green-300',
    danger: 'bg-red-100 text-red-700 border border-red-300',
    progress: 'bg-yellow-100 text-gray-900 border border-yellow-300',
    neutral: 'bg-gray-100 text-gray-700 border border-gray-300',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${map[kind]}`}>
      {children}
    </span>
  );
}
