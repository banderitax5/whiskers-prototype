// Minimal toast store.
//
// Why this exists instead of react-hot-toast: that library styles itself with
// goober, a CSS-in-JS runtime that injects a <style> element as soon as it
// loads. Our production CSP is `style-src 'self'` (inline style *attributes*
// are allowed through `style-src-attr`), so that element is blocked: toasts
// would lose their styles and the browser would log a CSP violation on every
// page. Rendering toasts with Tailwind classes keeps the policy strict and
// drops a dependency.
//
// The public API mirrors the parts of react-hot-toast the app actually used:
// callable toast() for plain messages, plus success / error / info / custom /
// dismiss, all returning the toast id.

const DEFAULT_DURATION = 4000

let toasts = []
let nextId = 1
const timers = new Map()
const listeners = new Set()

function emit() {
  for (const listener of listeners) listener(toasts)
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Stable snapshot for useSyncExternalStore: the array identity only changes
// when a toast is added or removed.
export function getToasts() {
  return toasts
}

export function dismiss(id) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const next = toasts.filter((item) => item.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

function push(kind, content, options = {}) {
  const { duration = DEFAULT_DURATION } = options
  const id = nextId++
  toasts = [...toasts, { id, kind, content }]
  emit()
  // duration: Infinity keeps the toast until it is dismissed (the Undo toast
  // uses a finite window, so this is only for future callers).
  if (Number.isFinite(duration) && duration > 0) {
    timers.set(id, setTimeout(() => dismiss(id), duration))
  }
  return id
}

const toast = (message, options) => push('info', message, options)
toast.success = (message, options) => push('success', message, options)
toast.error = (message, options) => push('error', message, options)
toast.info = (message, options) => push('info', message, options)
toast.custom = (render, options) => push('custom', render, options)
toast.dismiss = dismiss

export default toast
