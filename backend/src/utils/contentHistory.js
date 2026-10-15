// Best-effort content history: one jsonb snapshot row per owner-visible
// content write (create/update/archive/restore/reorder/reset), so the admin
// can answer "what changed on my storefront, and who did it" from data, not
// memory. Mirrors recordPriceHistory: a failed history insert is logged but
// never fails the write itself - the live row is the source of truth.
//
// Snapshots for updates carry ONLY the fields that actually changed, each as
// { from, to } (see diffChanges), plus a human "name" so the history list can
// say which item moved. Creates still store the full row (everything is new);
// the dialog renders both shapes.

import { supabaseAdmin } from '../config/supabase.js'
import logger from './logger.js'

// bookkeeping + analytics columns that are never an "owner made a change"
// signal: a storefront click ticking between before/after selects must not
// show up as a banner edit
const VOLATILE_FIELDS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'impressions', 'clicks'])

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function sameLeaf(a, b) {
  const x = a === undefined ? null : a
  const y = b === undefined ? null : b
  if (x === y) return true
  if (Array.isArray(x) || Array.isArray(y) || (x && y && typeof x === 'object' && typeof y === 'object')) {
    return JSON.stringify(x) === JSON.stringify(y)
  }
  return false
}

// deep diff of `fields` (default: every key in after) - plain objects are
// flattened to "parent · child" keys so a payment-method toggle reads as one
// line instead of a whole jsonb blob; arrays and scalars compare as leaves
export function diffChanges(before, after, fields) {
  const keys = Array.isArray(fields) ? fields : Object.keys(after || {})
  const changes = {}
  const walk = (path, a, b) => {
    if (isPlainObject(a) && isPlainObject(b)) {
      const subKeys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      for (const sk of subKeys) walk(`${path} · ${sk}`, a[sk], b[sk])
      return
    }
    if (!sameLeaf(a, b)) changes[path] = { from: a === undefined ? null : a, to: b === undefined ? null : b }
  }
  for (const key of keys) {
    if (VOLATILE_FIELDS.has(key)) continue
    walk(key, before?.[key], after?.[key])
  }
  return changes
}

// first non-blank string among the given label columns - the entry title the
// owner recognizes ("Royal Canin banner"), never a raw id
export function historyLabel(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export async function recordContentHistory(entity, entityId, action, snapshot, actor) {
  try {
    const { error } = await supabaseAdmin.from('site_content_history').insert({
      entity,
      entity_id: String(entityId ?? ''),
      action,
      snapshot: snapshot ?? {},
      actor: actor || null,
    })
    if (error) logger.warn({ err: error, entity, entityId, action }, 'Content history insert failed')
  } catch (err) {
    logger.warn({ err, entity, entityId, action }, 'Content history insert failed')
  }
}
