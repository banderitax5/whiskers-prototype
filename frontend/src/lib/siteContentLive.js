// Live storefront content: one shared Supabase Realtime channel for the whole
// tab. The browser watches a single tiny row (site_content_version) that the
// database bumps on every content edit; the row holds no storefront content,
// only a counter. When it changes every mounted consumer re-fetches through
// the normal /api/site-content endpoint, so shoppers see admin edits without
// refreshing.
//
// Two independent triggers keep this reliable:
//   1. Realtime UPDATE on public.site_content_version - instant (sub-second).
//   2. A 60 s version poll + a check when the tab becomes visible - covers a
//      project with Realtime switched off, a dropped socket, or a phone that
//      was asleep.
//
// If the 2026-11-06 migration has not been run, the table read fails, polling
// gives up quietly and the storefront behaves exactly as before.

import { useEffect, useState } from 'react'
import { fetchSiteContent } from './siteContent.js'

const POLL_MS = 60_000
const POLL_FAILURE_LIMIT = 3
const DEBOUNCE_MS = 250

// Vitest sets MODE=test. Never open sockets or intervals from tests.
const isTest = import.meta.env.MODE === 'test'

const listeners = new Set()
let channel = null
let starting = false
let subscribedOnce = false
let refreshTimer = null
let pollTimer = null
let pollFailures = 0
let initialChecks = 0
let knownVersion = 0
let pendingVersion = 0

async function supabaseClient() {
  try {
    const { default: supabase } = await import('./supabase.js')
    return supabase || null
  } catch {
    return null
  }
}

function fanOut(content) {
  for (const listener of [...listeners]) {
    try {
      listener(content)
    } catch {
      // one broken consumer must not stop the others
    }
  }
}

// Remember the counter that came with a payload so the first poll knows what
// this tab already has and does not fire a pointless second fetch.
export function noteContentVersion(content) {
  const version = Number(content?.content_version) || 0
  if (version > 0) knownVersion = Math.max(knownVersion, version)
}

// Re-fetch once, forcing past the client cache, and hand the fresh payload to
// every mounted consumer. The version tells the API to rebuild its own cache
// if that copy is older than the edit we were notified about.
async function refresh(version = 0) {
  const v = Number(version) > 0 ? Number(version) : pendingVersion
  const data = await fetchSiteContent(true, v)
  if (!data) return null
  const incoming = Number(data.content_version) || 0
  // A slower, older request must not overwrite a newer payload that already
  // landed (two saves close together). Ignore anything behind what we have.
  if (incoming > 0 && incoming < knownVersion) return data
  if (incoming > 0) knownVersion = incoming
  fanOut(data)
  return data
}

// Several tables can change in one admin save; collapse the burst into one
// refetch so the storefront does not stampede the API.
function scheduleRefresh(version = 0) {
  if (Number(version) > 0) pendingVersion = Math.max(pendingVersion, Number(version))
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    if (listeners.size > 0) refresh(pendingVersion)
  }, DEBOUNCE_MS)
}

// Read the counter straight from Supabase. This is the safety net when the
// Realtime socket is unavailable. Stops after repeated failures (migration not
// run), so an un-upgraded project logs no endless errors.
async function checkVersion() {
  if (isTest) return
  if (listeners.size === 0) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  const supabase = await supabaseClient()
  if (!supabase?.from) return
  try {
    const { data, error } = await supabase
      .from('site_content_version')
      .select('version')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      pollFailures += 1
      if (pollFailures >= POLL_FAILURE_LIMIT && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      return
    }
    pollFailures = 0
    const version = Number(data?.version) || 0
    if (!version) return
    // Until the first content fetch reports its version, compare nothing:
    // that fetch may still be in flight and fetching again would double every
    // page load. Retry briefly instead; if content never arrives, adopt the
    // database version and let the next change trigger a fetch.
    if (knownVersion === 0) {
      if (initialChecks < 3) {
        initialChecks += 1
        setTimeout(checkVersion, 1500)
      } else {
        knownVersion = version
      }
      return
    }
    if (version !== knownVersion) {
      // knownVersion advances inside refresh() only after a good response,
      // so a failed fetch is retried by the next poll instead of lost
      scheduleRefresh(version)
    }
  } catch {
    // best effort: realtime remains the primary path
  }
}

function startPolling() {
  if (isTest || pollTimer) return
  checkVersion()
  pollTimer = setInterval(checkVersion, POLL_MS)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') checkVersion()
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisible)
  }
}

function startRealtime() {
  if (isTest || channel || starting) return
  starting = true
  supabaseClient()
    .then((supabase) => {
      if (!supabase?.channel || channel) return
      channel = supabase
        .channel('site-content-live')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'site_content_version' },
          (payload) => {
            const version = Number(payload?.new?.version) || 0
            scheduleRefresh(version)
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          // A reconnect may have missed edits while the socket was down.
          if (subscribedOnce) checkVersion()
          subscribedOnce = true
        })
    })
    .catch(() => {
      channel = null
    })
    .finally(() => {
      starting = false
    })
}

function subscribe(listener) {
  listeners.add(listener)
  startRealtime()
  startPolling()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopPolling()
  }
}

// The hook every storefront component uses instead of its own fetch+state.
// It renders the fresh payload immediately and again whenever the database
// says content changed.
//   force: true  - skip the shared cache (pages that remount on navigation)
export function useSiteContent({ force = false } = {}) {
  const [state, setState] = useState({ content: null, loaded: false })

  useEffect(() => {
    let alive = true
    const apply = (data) => {
      noteContentVersion(data)
      if (alive) setState({ content: data, loaded: true })
    }
    fetchSiteContent(force).then(apply)
    const unsubscribe = subscribe(apply)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [force])

  return state
}

// Test seam: pretend the database counter changed. Also useful for a future
// "refresh content" admin action. Not called by the app otherwise.
export function notifySiteContentChanged(version = 0) {
  if (Number(version) > 0) knownVersion = Number(version)
  scheduleRefresh(version)
}

// Test seam: clear module state between tests.
export function resetSiteContentLiveForTests() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  stopPolling()
  listeners.clear()
  channel = null
  starting = false
  subscribedOnce = false
  knownVersion = 0
  pendingVersion = 0
  pollFailures = 0
  initialChecks = 0
}
