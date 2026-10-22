// Pure join of profile rows (encrypted names) and GoTrue users into an
// email <-> id <-> name index. Split from actorNames.js so the join logic
// is unit-testable without importing the Supabase config (which throws
// when env vars are absent).

import { decryptText } from './encryption.js'

function safeDecrypt(value) {
  try {
    return decryptText(value) || ''
  } catch {
    return ''
  }
}

// profileRows: [{ id, first_name, last_name }] (names still encrypted)
// authUsers: [{ id, email }] from GoTrue admin.listUsers
// returns { byEmail: Map<lowercased email, { id, name }>, byId: Map<id, { email, name }> }
export function buildActorIndex(profileRows, authUsers) {
  const byEmail = new Map()
  const byId = new Map()
  const nameById = new Map()
  for (const p of profileRows || []) {
    if (!p?.id) continue
    const name = [safeDecrypt(p.first_name), safeDecrypt(p.last_name)]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(' ')
    if (name) nameById.set(p.id, name)
  }
  for (const u of authUsers || []) {
    if (!u?.id || !u?.email) continue
    const email = String(u.email).toLowerCase()
    const name = nameById.get(u.id) || null
    byEmail.set(email, { id: u.id, name })
    byId.set(u.id, { email, name })
  }
  return { byEmail, byId }
}
