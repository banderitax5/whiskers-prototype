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

function DragProbe({ onDrop }) {
  const drag = useReorderDrag(onDrop)
  return (
    <div>
      {[0, 1].map((i) => (
        <div key={i} data-sort-index={i} data-testid={`r${i}`}>
          <button type="button" data-testid={`h${i}`} {...drag.handleProps(i)}>grip {i}</button>
        </div>
      ))}
    </div>
  )
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
    const c = await mount(<DragProbe onDrop={onDrop} />)
    const row1 = c.querySelector('[data-testid="r1"]')
    document.elementFromPoint = vi.fn(() => row1)
    const h0 = c.querySelector('[data-testid="h0"]')

    await act(async () => {
      h0.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))
    })
    await act(async () => {
      window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 30, clientY: 30 }))
    })
    await act(async () => { window.dispatchEvent(new window.MouseEvent('pointerup')) })
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith(0, 1)
  })

  it('does not commit when the pointer never left the starting row', async () => {
    const onDrop = vi.fn()
    const c = await mount(<DragProbe onDrop={onDrop} />)
    const h0 = c.querySelector('[data-testid="h0"]')

    await act(async () => {
      h0.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))
    })
    await act(async () => { window.dispatchEvent(new window.MouseEvent('pointerup')) })
    expect(onDrop).not.toHaveBeenCalled()
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
