/* eslint-disable react-refresh/only-export-components -- hooks + helpers shared by the four admin content pages; the components in this file are stable and never hot-swapped alone */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { BsGripVertical } from "react-icons/bs"

// Shared "Selecting Items" plumbing for the four content pages (Media,
// Banners, Home Sections, Navigation): multi-select, long-press to select,
// a bulk-action bar, a per-id bulk runner, and pointer drag-to-reorder.
// The four pages keep their own data + endpoints; this file owns only the
// interaction model so every page selects the same way.

// ── multi-select ──────────────────────────────────────────────────────────
// ids only. prune() drops ids that left the list (archived elsewhere, page
// changed) so the bar never counts rows the buttons cannot act on.
export function useSelection() {
  const [selected, setSelected] = useState(() => new Set())

  const toggle = useCallback((id) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const clear = useCallback(() => setSelected(new Set()), [])
  const selectAll = useCallback((ids) => setSelected(new Set(ids)), [])
  const prune = useCallback((ids) => {
    const keep = new Set(ids)
    setSelected((s) => {
      const next = new Set([...s].filter((id) => keep.has(id)))
      return next.size === s.size ? s : next
    })
  }, [])
  const isSelected = useCallback((id) => selected.has(id), [selected])

  return { selected, count: selected.size, isSelected, toggle, clear, selectAll, prune }
}

// ── long-press ────────────────────────────────────────────────────────────
// press-and-hold a card (~450ms) to select it - the mobile way into the
// selection. Presses that start on a button/input are ignored (a slow tap on
// "Edit" must not also select), movement cancels the timer, and the click the
// browser synthesizes after the hold is swallowed so the row does not
// toggle twice.
export function useLongPress(onActivate, { ms = 450 } = {}) {
  const timer = useRef(null)
  const fired = useRef(false)
  const start = useRef(null)
  const activateRef = useRef(onActivate)

  useEffect(() => { activateRef.current = onActivate }, [onActivate])
  const stop = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])
  useEffect(() => stop, [stop])

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      if (e.target && typeof e.target.closest === "function" && e.target.closest("button, a, input, select, textarea, label")) return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      stop()
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        activateRef.current()
      }, ms)
    },
    onPointerMove: (e) => {
      if (!timer.current || !start.current) return
      if (Math.abs(e.clientX - start.current.x) > 12 || Math.abs(e.clientY - start.current.y) > 12) stop()
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onClickCapture: (e) => {
      if (fired.current) {
        fired.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  }
}

// ── row checkbox ──────────────────────────────────────────────────────────
// pointerdown stops at the checkbox so a long-press gesture on it never
// reaches the card's useLongPress handler.
export function RowCheckBox({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-4 w-4 shrink-0 rounded border-gray-300 dark:border-[#2c4a6f] accent-[#F28C28] cursor-pointer"
    />
  )
}

// ── bulk action bar ───────────────────────────────────────────────────────
// renders only while something is selected; the persistent "Select all"
// checkbox lives with the list (a bar at zero selected would be invisible).
export function SelectionBar({ count, onClear, children }) {
  if (count === 0) return null
  return (
    <div role="toolbar" aria-label="Selection actions" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#F28C28]/40 bg-[#F28C28]/10 px-3 py-2">
      <span className="text-xs font-bold text-[#a35b0c] dark:text-[#F9B671]">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// the always-visible row above the list: select all / none of the current view
export function SelectAllRow({ allSelected, someSelected, onToggle, total, noun = "item" }) {
  if (total === 0) return null
  return (
    <label className="mb-3 flex w-fit items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 cursor-pointer">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => { if (el) el.indeterminate = Boolean(someSelected) && !allSelected }}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-300 dark:border-[#2c4a6f] accent-[#F28C28]"
      />
      Select all ({total} {noun}{total === 1 ? "" : "s"})
    </label>
  )
}

// ── bulk runner ───────────────────────────────────────────────────────────
// per-id allSettled so one 409/404 never hides the successes; pages turn the
// result into a toast and clear the selection.
export async function bulkApply(ids, fn) {
  const results = await Promise.allSettled(ids.map((id) => fn(id)))
  const ok = []
  const fail = []
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push(ids[i])
    else fail.push({ id: ids[i], err: r.reason })
  })
  return { ok, fail }
}

export function bulkSummary(action, res, noun = "item") {
  const total = res.ok.length + res.fail.length
  if (res.fail.length === 0) return `${action} ${res.ok.length} ${res.ok.length === 1 ? noun : `${noun}s`}`
  const first = res.fail[0].err?.message || "failed"
  return `${action} ${res.ok.length} of ${total} - ${first}`
}

// ── drag to reorder ───────────────────────────────────────────────────────
// pointer-based so it works with touch (implicit pointer capture on the
// handle) and mouse alike. Rows carry data-sort-index; the drop commits once
// through onDrop(from, to). The ↑↓ buttons stay the accessible path.
export function useReorderDrag(onDrop) {
  const [drag, setDrag] = useState(null) // { from, over }
  const dropRef = useRef(onDrop)
  const suppressClick = useRef(false)

  useEffect(() => { dropRef.current = onDrop }, [onDrop])

  useEffect(() => {
    if (!drag) return undefined
    const move = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const row = el && typeof el.closest === "function" ? el.closest("[data-sort-index]") : null
      if (row) {
        const over = Number(row.dataset.sortIndex)
        setDrag((d) => (d && d.over !== over ? { ...d, over } : d))
      }
    }
    const end = () => {
      suppressClick.current = Boolean(drag && drag.over !== drag.from)
      if (drag && drag.over !== null && drag.over !== drag.from) dropRef.current(drag.from, drag.over)
      setDrag(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
  }, [drag])

  const handleProps = (index) => ({
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      setDrag({ from: index, over: index })
    },
    onClickCapture: (e) => {
      if (suppressClick.current) {
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  })

  return {
    handleProps,
    isDragging: (index) => drag?.from === index,
    isOver: (index) => Boolean(drag && drag.from !== index && drag.over === index),
    active: Boolean(drag),
  }
}

// grip shown at the start of each reorderable row
export function GripHandle({ handleProps, label = "Drag to reorder" }) {
  return (
    <span
      aria-hidden="true"
      title={label}
      {...handleProps}
      className="inline-flex shrink-0 items-center cursor-grab active:cursor-grabbing touch-none select-none text-gray-400 dark:text-slate-500 hover:text-[#F28C28] px-1"
    >
      <BsGripVertical />
    </span>
  )
}

// small shared button styles for bar actions (kept consistent with the
// per-row buttons the four cards already use)
export const barBtn = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition disabled:opacity-50"
export const barBtnPlain = `${barBtn} text-gray-600 dark:text-slate-300 border-gray-300 dark:border-[#2c4a6f] hover:bg-gray-100 dark:hover:bg-[#1e3a5f]`
export const barBtnDanger = `${barBtn} text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40`
export const barBtnAccent = `${barBtn} text-white bg-[#F28C28] border-[#F28C28] hover:bg-[#d97a1f]`
