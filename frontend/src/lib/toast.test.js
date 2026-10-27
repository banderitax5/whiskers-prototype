import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import toast, { dismiss, getToasts, subscribe } from './toast.js'

// The store is module-level, so each test starts from an empty stack.
function clearAll() {
  for (const item of getToasts()) dismiss(item.id)
}

beforeEach(() => {
  vi.useFakeTimers()
  clearAll()
})

afterEach(() => {
  clearAll()
  vi.useRealTimers()
})

describe('toast store', () => {
  it('adds a toast, returns its id and notifies subscribers', () => {
    const seen = []
    const unsubscribe = subscribe((items) => seen.push(items.length))

    const id = toast.success('Saved')

    expect(typeof id).toBe('number')
    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0]).toMatchObject({ id, kind: 'success', content: 'Saved' })
    expect(seen).toContain(1)

    unsubscribe()
  })

  it('keeps the snapshot reference stable while nothing changes', () => {
    toast.error('Boom')
    const first = getToasts()
    expect(getToasts()).toBe(first)
  })

  it('auto-dismisses after the default 4 second window', () => {
    toast.success('Saved')
    expect(getToasts()).toHaveLength(1)

    vi.advanceTimersByTime(3999)
    expect(getToasts()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('honours a custom duration', () => {
    toast.error('Slow', { duration: 10000 })
    vi.advanceTimersByTime(4000)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(6000)
    expect(getToasts()).toHaveLength(0)
  })

  it('dismiss removes the toast immediately and cancels its timer', () => {
    const id = toast.success('Saved')
    dismiss(id)

    expect(getToasts()).toHaveLength(0)
    // The pending timer must not fire again or throw on a missing toast.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    expect(getToasts()).toHaveLength(0)
  })

  it('dismissing an unknown id is a no-op', () => {
    toast.success('Saved')
    dismiss(9999)
    expect(getToasts()).toHaveLength(1)
  })

  it('custom toasts keep their render function for the Toaster', () => {
    const render = ({ id }) => `undo-${id}`
    const id = toast.custom(render, { duration: 5000 })

    expect(getToasts()[0]).toMatchObject({ id, kind: 'custom', content: render })
  })

  it('the callable default and toast.info() both create info toasts', () => {
    // ShopContext.pushNotification used to call react-hot-toast's callable
    // default export, and AdminCustomers still does.
    const first = toast('Please sign in')
    const second = toast.info('Order placed')

    expect(getToasts().map((item) => [item.id, item.kind, item.content])).toEqual([
      [first, 'info', 'Please sign in'],
      [second, 'info', 'Order placed'],
    ])
  })

  it('duration Infinity keeps the toast on screen', () => {
    toast.error('Sticky', { duration: Infinity })
    vi.advanceTimersByTime(60000)
    expect(getToasts()).toHaveLength(1)
  })
})
