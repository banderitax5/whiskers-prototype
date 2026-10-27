// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import React, { useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import {
  useSelection,
  useLongPress,
  bulkApply,
  bulkSummary,
  useReorderDrag,
  edgeScrollStep,
  findScrollParent,
  SelectionBar,
  SelectAllRow,
} from './adminBulk.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

async function mount(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  cleanup = () => act(() => root.unmount())
  return container
}

async function click(el) {
  await act(async () => { el.click() })
}

function SelProbe() {
  const sel = useSelection()
  return (
    <div>
      <span data-testid="count">{sel.count}</span>
      <button type="button" data-testid="toggle" onClick={() => sel.toggle('a')}>toggle</button>
      <button type="button" data-testid="all" onClick={() => sel.selectAll(['a', 'b'])}>all</button>
      <button type="button" data-testid="add" onClick={() => sel.selectAdd(['c'])}>add</button>
      <button type="button" data-testid="deselect" onClick={() => sel.deselect(['a', 'b'])}>deselect</button>
      <button type="button" data-testid="prune" onClick={() => sel.prune(['b'])}>prune</button>
      <button type="button" data-testid="clear" onClick={() => sel.clear()}>clear</button>
    </div>
  )
}

function LPProbe({ onFire }) {
  const lp = useLongPress(onFire)
  return (
    <div data-testid="card" {...lp}>
      <button type="button" data-testid="btn">b</button>
    </div>
  )
}

function DragProbe({ onDrop, rows = 2, scroller = false }) {
  const drag = useReorderDrag(onDrop)
  const list = (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          data-sort-index={i}
          data-testid={`r${i}`}
          data-dragging={drag.isDragging(i) ? "1" : undefined}
          style={drag.rowStyle(i)}
        >
          <button type="button" data-testid={`h${i}`} {...drag.handleProps(i)}>grip {i}</button>
        </div>
      ))}
    </div>
  )
  if (!scroller) return list
  return <div data-testid="scroller" style={{ overflowY: "auto" }}>{list}</div>
}

// jsdom reports every rect as 0x0 - give the probe real stacked geometry so the
// hit-testing and the preview maths can be asserted (height 100, 12px gap).
function stubGeometry(c, { height = 100, gap = 12 } = {}) {
  const rects = new Map()
  ;[...c.querySelectorAll("[data-sort-index]")].forEach((row, i) => {
    const top = i * (height + gap)
    rects.set(row, { top, y: top, bottom: top + height, height, left: 0, x: 0, right: 300, width: 300, toJSON() {} })
  })
  const real = window.Element.prototype.getBoundingClientRect
  window.Element.prototype.getBoundingClientRect = function () {
    return rects.get(this) || real.call(this)
  }
  return () => { window.Element.prototype.getBoundingClientRect = real }
}

async function pointerDown(el, { x = 5, y = 5 } = {}) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }))
  })
}

async function pointerMove({ x = 5, y = 5 } = {}) {
  await act(async () => {
    window.dispatchEvent(new window.MouseEvent("pointermove", { clientX: x, clientY: y }))
  })
}

async function pointerUp() {
  await act(async () => { window.dispatchEvent(new window.MouseEvent("pointerup")) })
}

function BarProbe() {
  const [count, setCount] = useState(2)
  return (
    <div>
      <SelectionBar count={count} onClear={() => setCount(0)}>
        <button type="button">Archive 2</button>
      </SelectionBar>
      <SelectAllRow allSelected={false} someSelected onToggle={() => {}} total={3} noun="image" />
    </div>
  )
}

describe('useSelection', () => {
  it('toggles, selects all, prunes removed ids and clears', async () => {
    const c = await mount(<SelProbe />)
    const count = () => c.querySelector('[data-testid="count"]').textContent

    expect(count()).toBe('0')
    await click(c.querySelector('[data-testid="toggle"]')) // selects a
    expect(count()).toBe('1')
    await click(c.querySelector('[data-testid="toggle"]')) // deselects a
    expect(count()).toBe('0')
    await click(c.querySelector('[data-testid="all"]')) // a + b
    expect(count()).toBe('2')
    await click(c.querySelector('[data-testid="prune"]')) // a left the list
    expect(count()).toBe('1')
    await click(c.querySelector('[data-testid="clear"]'))
    expect(count()).toBe('0')
  })

  it('selectAdd keeps the existing selection; deselect drops only the given ids', async () => {
    const c = await mount(<SelProbe />)
    const count = () => c.querySelector('[data-testid="count"]').textContent

    await click(c.querySelector('[data-testid="all"]')) // a + b
    expect(count()).toBe('2')
    await click(c.querySelector('[data-testid="add"]')) // + c
    expect(count()).toBe('3')
    await click(c.querySelector('[data-testid="deselect"]')) // - a, b
    expect(count()).toBe('1') // c survives
  })
})

describe('useLongPress', () => {
  it('fires after the hold, but not when movement cancels it', async () => {
    vi.useFakeTimers()
    const onFire = vi.fn()
    const c = await mount(<LPProbe onFire={onFire} />)
    const card = c.querySelector('[data-testid="card"]')

    await act(async () => {
      card.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    expect(onFire).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(onFire).toHaveBeenCalledTimes(1)

    // a move before the timer cancels the gesture
    await act(async () => {
      card.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
      card.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 90, clientY: 90 }))
    })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('ignores presses that start on a button (a slow tap must not also select)', async () => {
    vi.useFakeTimers()
    const onFire = vi.fn()
    const c = await mount(<LPProbe onFire={onFire} />)
    const btn = c.querySelector('[data-testid="btn"]')

    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('releasing before the hold does not fire', async () => {
    vi.useFakeTimers()
    const onFire = vi.fn()
    const c = await mount(<LPProbe onFire={onFire} />)
    const card = c.querySelector('[data-testid="card"]')

    await act(async () => {
      card.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
      card.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(onFire).not.toHaveBeenCalled()
  })
})

describe('bulkApply / bulkSummary', () => {
  it('keeps successes when one id fails', async () => {
    const res = await bulkApply(['a', 'b', 'c'], (id) =>
      (id === 'b' ? Promise.reject(new Error('boom')) : Promise.resolve()))
    expect(res.ok).toEqual(['a', 'c'])
    expect(res.fail).toHaveLength(1)
    expect(res.fail[0].id).toBe('b')
    expect(res.fail[0].err.message).toBe('boom')
    expect(bulkSummary('Archived', res)).toBe('Archived 2 of 3 - boom')
  })

  it('counts plural forms with the right noun', async () => {
    const one = await bulkApply(['x'], () => Promise.resolve())
    expect(bulkSummary('Restored', one, 'image')).toBe('Restored 1 image')
    const two = await bulkApply(['x', 'y'], () => Promise.resolve())
    expect(bulkSummary('Restored', two, 'image')).toBe('Restored 2 images')
  })
})

describe('useReorderDrag', () => {
  it('commits a drop only when the row changed', async () => {
    const onDrop = vi.fn()
    const c = await mount(<DragProbe onDrop={onDrop} rows={3} />)
    const restore = stubGeometry(c)
    try {
      await pointerDown(c.querySelector('[data-testid="h0"]'))
      await pointerMove({ y: 150 }) // past row 1's midpoint, before row 2's
      await pointerUp()
      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith(0, 1)
    } finally { restore() }
  })

  it('does not commit when the pointer never left the starting row', async () => {
    const onDrop = vi.fn()
    const c = await mount(<DragProbe onDrop={onDrop} rows={3} />)
    const restore = stubGeometry(c)
    try {
      await pointerDown(c.querySelector('[data-testid="h0"]'))
      await pointerUp()
      expect(onDrop).not.toHaveBeenCalled()
    } finally { restore() }
  })

  it('previews the move with transforms without touching the DOM order', async () => {
    const onDrop = vi.fn()
    const c = await mount(<DragProbe onDrop={onDrop} rows={3} />)
    const restore = stubGeometry(c)
    try {
      const r0 = c.querySelector('[data-testid="r0"]')
      const r1 = c.querySelector('[data-testid="r1"]')
      const r2 = c.querySelector('[data-testid="r2"]')
      await pointerDown(c.querySelector('[data-testid="h0"]'))
      await pointerMove({ y: 250 }) // first row down to the last slot

      // carried row slides into the slot, the rows it passes step up one pitch
      expect(r0.style.transform).toBe("translateY(224px)")
      expect(r1.style.transform).toBe("translateY(-112px)")
      expect(r2.style.transform).toBe("translateY(-112px)")
      expect(r0.dataset.dragging).toBe("1")

      // layout is untouched: React order stays 0,1,2 (only transforms move)
      const order = [...c.querySelectorAll("[data-sort-index]")].map((el) => el.dataset.sortIndex)
      expect(order).toEqual(["0", "1", "2"])

      await pointerUp()
      // transforms are dropped once the gesture ends
      expect(r0.style.transform).toBe("")
      expect(r1.style.transform).toBe("")
      expect(onDrop).toHaveBeenCalledWith(0, 2)
    } finally { restore() }
  })

  it('moves rows down when dragging upward', async () => {
    const onDrop = vi.fn()
    const c = await mount(<DragProbe onDrop={onDrop} rows={3} />)
    const restore = stubGeometry(c)
    try {
      await pointerDown(c.querySelector('[data-testid="h2"]'), { y: 230 })
      await pointerMove({ y: 10 }) // above row 0's midpoint
      expect(c.querySelector('[data-testid="r2"]').style.transform).toBe("translateY(-224px)")
      expect(c.querySelector('[data-testid="r0"]').style.transform).toBe("translateY(112px)")
      expect(c.querySelector('[data-testid="r1"]').style.transform).toBe("translateY(112px)")
      await pointerUp()
      expect(onDrop).toHaveBeenCalledWith(2, 0)
    } finally { restore() }
  })
})

describe('edgeScrollStep', () => {
  it('holds still in the middle and ramps up toward the edges', () => {
    expect(edgeScrollStep(100, 0, 200)).toBe(0)
    expect(edgeScrollStep(56, 0, 200)).toBe(0) // just outside the 56px top zone
    expect(edgeScrollStep(0, 0, 200)).toBe(-16) // pinned at the very top
    expect(edgeScrollStep(200, 0, 200)).toBe(16) // pinned at the very bottom
    expect(edgeScrollStep(150, 0, 200)).toBe(2) // 6px into the bottom zone
    expect(edgeScrollStep(195, 0, 200)).toBe(15)
  })

  it('never exceeds the edge zone of a short viewport and ignores garbage input', () => {
    // a 60px tall viewport: the zone shrinks to half its height (30px)
    expect(edgeScrollStep(10, 0, 60)).toBe(-11)
    expect(edgeScrollStep(30, 0, 60)).toBe(0)
    expect(edgeScrollStep(Number.NaN, 0, 200)).toBe(0)
    expect(edgeScrollStep(50, 0, 0)).toBe(0)
  })
})

describe('findScrollParent', () => {
  it('returns the nearest ancestor that can actually scroll', () => {
    const outer = document.createElement('div')
    outer.style.overflowY = 'auto'
    const middle = document.createElement('div')
    const inner = document.createElement('div')
    outer.appendChild(middle)
    middle.appendChild(inner)
    document.body.appendChild(outer)
    Object.defineProperty(outer, 'scrollHeight', { value: 800, configurable: true })
    Object.defineProperty(outer, 'clientHeight', { value: 300, configurable: true })

    expect(findScrollParent(inner)).toBe(outer)
    expect(findScrollParent(document.body)).toBeNull() // nothing scrollable above it

    // overflow declared but the content fits: not a scroller
    Object.defineProperty(outer, 'scrollHeight', { value: 300, configurable: true })
    expect(findScrollParent(inner)).toBeNull()
    outer.remove()
  })
})

describe('useReorderDrag auto-scroll', () => {
  function stubScroller(c) {
    const scroller = c.querySelector('[data-testid="scroller"]')
    Object.defineProperty(scroller, 'scrollHeight', { value: 900, configurable: true })
    Object.defineProperty(scroller, 'clientHeight', { value: 200, configurable: true })
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200, left: 0, right: 300, width: 300, x: 0, y: 0, toJSON() {} })
    return scroller
  }

  function stubFrames() {
    const frames = []
    const raf = window.requestAnimationFrame
    const cancel = window.cancelAnimationFrame
    window.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length }
    window.cancelAnimationFrame = () => {}
    return {
      frames,
      restore: () => { window.requestAnimationFrame = raf; window.cancelAnimationFrame = cancel },
    }
  }

  it('scrolls the list and re-targets the slot while the pointer sits at the edge', async () => {
    const onDrop = vi.fn()
    const { frames, restore: restoreFrames } = stubFrames()
    const c = await mount(<DragProbe onDrop={onDrop} rows={6} scroller />)
    const restoreGeometry = stubGeometry(c)
    const scroller = stubScroller(c)
    try {
      await pointerDown(c.querySelector('[data-testid="h0"]'), { y: 195 }) // bottom zone
      expect(scroller.scrollTop).toBe(0)

      await act(async () => { frames.shift()() })
      expect(scroller.scrollTop).toBeGreaterThan(0)

      // the rows moved under a stationary pointer, so the target slot advanced
      expect(c.querySelector('[data-testid="r0"]').style.transform).toBe('translateY(224px)')
    } finally {
      restoreFrames()
      restoreGeometry()
    }
  })

  it('stays put while the pointer is away from the edges', async () => {
    const onDrop = vi.fn()
    const { frames, restore: restoreFrames } = stubFrames()
    const c = await mount(<DragProbe onDrop={onDrop} rows={6} scroller />)
    const restoreGeometry = stubGeometry(c)
    const scroller = stubScroller(c)
    try {
      await pointerDown(c.querySelector('[data-testid="h0"]'), { y: 100 }) // middle
      await act(async () => { frames.shift()() })
      expect(scroller.scrollTop).toBe(0)
    } finally {
      restoreFrames()
      restoreGeometry()
    }
  })
})

describe('SelectionBar / SelectAllRow', () => {
  it('renders nothing at zero, shows count and clears otherwise', async () => {
    const c = await mount(<BarProbe />)
    expect(c.textContent).toContain('2 selected')
    expect(c.textContent).toContain('Select all (3 images)')

    const box = [...c.querySelectorAll('label')].find((l) => /Select all/.test(l.textContent))?.querySelector('input')
    expect(box?.indeterminate).toBe(true)

    const clear = [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Clear')
    await click(clear)
    expect(c.textContent).not.toContain('selected')
    // select-all row survives (it belongs to the list, not the selection)
    expect(c.textContent).toContain('Select all (3 images)')
  })

  it('is absent while nothing is selected', async () => {
    const c = await mount(<SelectionBar count={0} onClear={() => {}}><button type="button">x</button></SelectionBar>)
    expect(c.innerHTML).toBe('')
  })
})
