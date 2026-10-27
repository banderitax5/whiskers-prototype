// Tiny emitter for the big top-center auth confirmation banner. Kept separate
// from the bottom-right toast stack (lib/toast.js) because that one renders
// every toast at one global position.
const listeners = new Set()

export function notifyAuth({ title, body }) {
  for (const fn of listeners) {
    try {
      fn({ title, body, id: Date.now() })
    } catch {
      // a listener that unmounted mid-broadcast must not break the others
    }
  }
}

export function subscribeAuthNotice(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
