/* eslint-disable react-refresh/only-export-components -- hooks + helpers shared by the four admin content pages; the components in this file are stable and never hot-swapped alone */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { BsGripVertical } from "react-icons/bs"

// Shared "Selecting Items" plumbing for the admin pages (Media, Banners,
// Home Sections, Navigation, Products): multi-select, long-press to select,
// a bulk-action bar, a per-id bulk runner, and pointer drag-to-reorder.
// The pages keep their own data + endpoints; this file owns only the
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
  // additive select-all: keeps ids selected under other filters
  const selectAdd = useCallback((ids) => {
    setSelected((s) => {
      const next = new Set(s)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])
  // drop a subset (deselect-all of the current view)
  const deselect = useCallback((ids) => {
    const drop = new Set(ids)
    setSelected((s) => {
      const next = new Set([...s].filter((id) => !drop.has(id)))
      return next.size === s.size ? s : next
    })
  }, [])
  const prune = useCallback((ids) => {
    const keep = new Set(ids)
    setSelected((s) => {
      const next = new Set([...s].filter((id) => keep.has(id)))
      return next.size === s.size ? s : next
    })
  }, [])
  const isSelected = useCallback((id) => selected.has(id), [selected])

  return { selected, count: selected.size, isSelected, toggle, clear, selectAll, selectAdd, deselect, prune }
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
      if (e.target && typeof e.target.closest === "function" && e.target.closest("button, a, input, select, textarea, label, [data-drag-handle]")) return
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
      className="h-4 w-4 shrink-0 rounded border-gray-300 dark:border-[#2c4a6f] accent-[#0b2e59] dark:accent-yellow-400 cursor-pointer"
    />
  )
}

// wrapper that turns press-and-hold into select - drop it around any card
// body (it is a component, so the hook inside stays legal in JSX trees)
export function LongPressBox({ onActivate, children, className }) {
  const longPress = useLongPress(onActivate)
  return (
    <div {...longPress} className={className}>
      {children}
    </div>
  )
}

// ── bulk action bar ───────────────────────────────────────────────────────
// renders only while something is selected; the persistent "Select all"
// checkbox lives with the list (a bar at zero selected would be invisible).
export function SelectionBar({ count, onClear, children }) {
  if (count === 0) return null
  return (
    <div role="toolbar" aria-label="Selection actions" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#0b2e59]/30 bg-[#0b2e59]/10 px-3 py-2 dark:border-yellow-400/30 dark:bg-yellow-400/10">
      <span className="text-xs font-bold text-[#0b2e59] dark:text-yellow-200">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#0b2e59] bg-white border border-[#0b2e59]/35 hover:bg-[#0b2e59]/10 dark:text-slate-200 dark:bg-[#162d4a] dark:border-[#2c4a6f] dark:hover:bg-[#1e3a5f] transition"
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
        className="h-4 w-4 rounded border-gray-300 dark:border-[#2c4a6f] accent-[#0b2e59] dark:accent-yellow-400"
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
// Pointer-based so touch (implicit pointer capture on the handle) and mouse
// share one code path. On pickup the list is measured once - rows keep their
// layout position and only CSS transforms move them - then every pointer move
// turns the pointer height into a target slot. The picked row slides to that
// slot at reduced opacity while the rows in between shift one step out of the
// way, so the list previews the result before the drop commits once through
// onDrop(from, to). Transforms keep the DOM order stable (React never fights
// us) and animate for free through each card's `transition` utility. Row
// offsets are taken from the list container, not the viewport, so the preview
// stays correct while the page scrolls under the pointer; holding the pointer
// near an edge of the scrolling area keeps scrolling it for you (see
// edgeScrollStep) so a slot that is off screen is still reachable. The ↑↓
// buttons stay the accessible path; the grip is aria-hidden.

// how close (px) to the edge of the scrolling area the pointer must be for the
// list to scroll by itself, and the fastest it moves (px per animation frame)
export const DRAG_SCROLL_EDGE = 56
export const DRAG_SCROLL_MAX_STEP = 16

// next scroll amount for a pointer at clientY inside a viewport of
// top..bottom: negative scrolls up, positive scrolls down, 0 means "hold still"
export function edgeScrollStep(clientY, top, bottom, edge = DRAG_SCROLL_EDGE, maxStep = DRAG_SCROLL_MAX_STEP) {
  if (!Number.isFinite(clientY) || !Number.isFinite(top) || !Number.isFinite(bottom)) return 0
  const zone = Math.max(0, Math.min(edge, (bottom - top) / 2))
  if (zone === 0) return 0
  if (clientY < top + zone) {
    const depth = Math.min(1, (top + zone - clientY) / zone)
    return -Math.max(1, Math.round(depth * maxStep))
  }
  if (clientY > bottom - zone) {
    const depth = Math.min(1, (clientY - (bottom - zone)) / zone)
    return Math.max(1, Math.round(depth * maxStep))
  }
  return 0
}

// nearest ancestor that can actually scroll vertically (null = the page itself)
export function findScrollParent(el) {
  let node = el
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = window.getComputedStyle(node).overflowY
    const scrolls = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay"
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node
    node = node.parentElement
  }
  return null
}

// slot the pointer is over, from the geometry captured at pickup (the container
// box is re-read so page scrolling never skews it)
function slotAt(drag, clientY) {
  if (!drag || !drag.heights.length) return 0
  const base = drag.container ? drag.container.getBoundingClientRect().top : 0
  for (let i = 0; i < drag.heights.length; i += 1) {
    if (clientY < base + drag.offsets[i] + drag.heights[i] / 2) return i
  }
  // last row by default
  return drag.heights.length - 1
}

export function useReorderDrag(onDrop) {
  const [drag, setDrag] = useState(null) // { from, over, container, scroller, offsets, heights, steps }
  const dragRef = useRef(null)
  const dropRef = useRef(onDrop)
  const pointerRef = useRef({ x: 0, y: 0 })
  const suppressClick = useRef(false)

  useEffect(() => { dropRef.current = onDrop }, [onDrop])

  const publish = useCallback((next) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const finish = useCallback((commit) => {
    const d = dragRef.current
    if (!d) return
    if (commit && d.over !== d.from) {
      suppressClick.current = true
      dropRef.current(d.from, d.over)
    }
    publish(null)
  }, [publish])

  const active = Boolean(drag)

  useEffect(() => {
    if (!active) return undefined
    const move = (e) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }
      const d = dragRef.current
      if (!d || !d.heights.length) return
      const over = slotAt(d, e.clientY)
      if (over !== d.over) publish({ ...d, over })
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [active, publish, finish])

  // hold the pointer near an edge and the list keeps scrolling, so a slot that
  // is currently off screen can still be reached; the target slot is recomputed
  // on every scrolled frame because scrolling moves the rows under a pointer
  // that is standing still
  useEffect(() => {
    if (!active || typeof requestAnimationFrame !== "function") return undefined
    let frame = 0
    const tick = () => {
      const d = dragRef.current
      if (!d) return
      const { y } = pointerRef.current
      const scroller = d.scroller
      const box = scroller
        ? scroller.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight || 0 }
      const step = edgeScrollStep(y, box.top, box.bottom)
      if (step !== 0) {
        const before = scroller ? scroller.scrollTop : window.scrollY
        if (scroller) scroller.scrollTop = before + step
        else window.scrollBy(0, step)
        const after = scroller ? scroller.scrollTop : window.scrollY
        if (after !== before) {
          const over = slotAt(d, y)
          if (over !== d.over) publish({ ...d, over })
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, publish])

  // no text selection / text caret while a row is being carried
  useEffect(() => {
    if (!active) return undefined
    const prevSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "grabbing"
    return () => {
      document.body.style.userSelect = prevSelect
      document.body.style.cursor = prevCursor
    }
  }, [active])

  const handleProps = (index) => ({
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      pointerRef.current = { x: e.clientX, y: e.clientY }
      const rowEl = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest("[data-sort-index]") : null
      const container = rowEl && rowEl.parentElement
      const rows = container
        ? Array.from(container.querySelectorAll("[data-sort-index]"))
          .sort((a, b) => Number(a.dataset.sortIndex) - Number(b.dataset.sortIndex))
        : []
      const containerTop = container ? container.getBoundingClientRect().top : 0
      const rects = rows.map((r) => r.getBoundingClientRect())
      const heights = rects.map((r) => r.height)
      // row pitch = own height + the gap the list puts between rows
      const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].top - heights[0]) : 0
      publish({
        from: index,
        over: index,
        container,
        scroller: findScrollParent(container),
        offsets: rects.map((r) => r.top - containerTop),
        heights,
        steps: heights.map((h) => h + gap),
      })
    },
    onClickCapture: (e) => {
      if (suppressClick.current) {
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  })

  // transform for each row while a drag is live (undefined when idle)
  const rowStyle = (index) => {
    if (!drag) return undefined
    const { from, over, offsets, steps } = drag
    if (!offsets.length) return undefined
    if (index === from) {
      // slide the carried row into the slot it would land in
      const dy = over > from
        ? offsets[over] + steps[over] - steps[from] - offsets[from]
        : over < from
          ? offsets[over] - offsets[from]
          : 0
      return { transform: `translateY(${Math.round(dy)}px)`, position: "relative", zIndex: 40 }
    }
    let dy = 0
    if (over > from && index > from && index <= over) dy = -steps[from]
    else if (over < from && index >= over && index < from) dy = steps[from]
    return dy ? { transform: `translateY(${Math.round(dy)}px)` } : undefined
  }

  return {
    handleProps,
    rowStyle,
    isDragging: (index) => drag?.from === index,
    active,
  }
}

// grip shown at the start of each reorderable row
export function GripHandle({ handleProps, label = "Drag to reorder" }) {
  return (
    <span
      aria-hidden="true"
      title={label}
      data-drag-handle
      {...handleProps}
      className="inline-flex shrink-0 items-center cursor-grab active:cursor-grabbing touch-none select-none text-gray-400 dark:text-slate-500 hover:text-[#0b2e59] dark:hover:text-yellow-300 px-1"
    >
      <BsGripVertical />
    </span>
  )
}

// small shared button styles for bar actions (kept consistent with the
// per-row buttons the four cards already use)
export const barBtn = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition disabled:opacity-50"
export const barBtnPlain = `${barBtn} text-[#0b2e59] bg-white border-[#0b2e59]/35 hover:bg-[#0b2e59]/10 dark:text-slate-200 dark:bg-[#162d4a] dark:border-[#2c4a6f] dark:hover:bg-[#1e3a5f]`
export const barBtnDanger = `${barBtn} text-red-700 bg-red-50 border-red-300 hover:bg-red-100 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800/70 dark:hover:bg-red-950/70`
export const barBtnAccent = `${barBtn} text-white bg-[#0b2e59] border-[#0b2e59] hover:bg-[#15407a] dark:bg-yellow-400 dark:border-yellow-400 dark:text-gray-900 dark:hover:bg-yellow-300`
