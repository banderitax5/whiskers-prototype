// Read-time resolution of audit/history actor emails to display names.
// profiles holds encrypted first/last names but no email; emails live in
// GoTrue. A single cached index joins both so the admin panel can show
// "Juan Dela Cruz" instead of an email address. Best-effort by design:
// any failure returns empty maps and callers fall back to the raw email.
//
// The join itself lives in actorIndex.js (pure, unit-tested); this module
// only fetches, caches, and stamps.

import { supabaseAdmin, supabaseAuth } from '../config/supabase.js'
import { buildActorIndex } from './actorIndex.js'
import logger from './logger.js'

const TTL_MS = 60_000
const MAX_PAGES = 10 // 10 x 100 = 1000 accounts; far beyond this shop
const PAGE_SIZE = 100

let cache = null // { at, byEmail, byId }
let inflight = null

async function fetchIndex() {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
  const users = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAuth.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error
    const list = data?.users || []
    users.push(...list)
    if (list.length < PAGE_SIZE) break
  }
  return buildActorIndex(profiles || [], users)
}

export async function getActorIndex() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const index = await fetchIndex()
      cache = { at: Date.now(), ...index }
      return cache
    } catch (err) {
      // do not cache failures - the next request retries
      logger.warn({ err }, 'actor index build failed')
      return { byEmail: new Map(), byId: new Map() }
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// stamps actor_name on rows whose {emailField} resolves to a known account;
// rows stay untouched (same object) when nothing resolves, so callers that
// only added a field keep their identity for the rest of the response
export async function withActorNames(rows, emailField = 'admin_email') {
  const list = rows || []
  if (list.length === 0) return list
  const { byEmail } = await getActorIndex()
  return list.map((row) => {
    const email = String(row?.[emailField] || '').toLowerCase()
    const name = email && email !== 'unknown' ? (byEmail.get(email)?.name || null) : null
    return name ? { ...row, actor_name: name } : row
  })
}
