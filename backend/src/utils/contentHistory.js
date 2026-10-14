// Best-effort content history: one jsonb snapshot row per owner-visible
// content write (create/update/archive/restore/reorder/reset), so the admin
// can answer "what changed on my storefront, and who did it" from data, not
// memory. Mirrors recordPriceHistory: a failed history insert is logged but
// never fails the write itself - the live row is the source of truth.

import { supabaseAdmin } from '../config/supabase.js'
import logger from './logger.js'

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
