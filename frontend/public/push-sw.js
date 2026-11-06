/* eslint-env serviceworker */
/* global self, clients */
// Web Push handlers for the back office.
//
// This file is imported by the generated service worker (vite.config.js ->
// workbox.importScripts), so it runs inside the same worker that caches the app
// shell. It has to stay dependency-free and must never throw: an exception here
// would break offline caching too.
//
// What it does:
//   - `push`  -> show a system notification (lock screen / notification shade)
//   - click   -> focus an open tab on the orders page, or open a new one
//   - close   -> nothing to clean up

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'New order received'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Same tag = replace the previous alert instead of stacking duplicates
    // when several orders land at once. renotify still re-alerts the phone.
    tag: data.tag || 'whiskers-order',
    renotify: true,
    data: { url: data.url || '/admin/orders' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target =
    (event.notification.data && event.notification.data.url) || '/admin/orders'

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              // navigation can be refused; the focused tab is still useful
            }
          }
          return
        }
      }
      if (clients.openWindow) await clients.openWindow(target)
    })()
  )
})
