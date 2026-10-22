// Cached reader for the single-row site_settings table (Phase 6). The
// checkout route uses this for the authoritative shipping fee; the same row
// feeds the public settings in GET /api/site-content. A database without the
// table (or an unreadable row) falls back to DEFAULT_SETTINGS, which matches
// today's hardcoded behavior, so checkout never breaks on a missing migration.

import { supabaseAdmin } from '../config/supabase.js'
import { isSchemaPendingError } from './pgErrors.js'
import { DEFAULT_SETTINGS, mergeSettings } from './siteSettingsRules.js'
import logger from './logger.js'

const CACHE_TTL_MS = 30_000
let cache = { at: 0, value: null }

export function invalidateSettingsCache() {
  cache = { at: 0, value: null }
}

export async function getSettings() {
  if (cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('data')
      .eq('id', 1)
      .maybeSingle()
    if (error && !isSchemaPendingError(error)) {
      logger.warn({ err: error }, 'site settings fetch failed, using defaults')
    }
    const value = mergeSettings(data?.data || {}, {})
    cache = { at: Date.now(), value }
    return value
  } catch (err) {
    logger.warn({ err }, 'site settings fetch threw, using defaults')
    return { ...DEFAULT_SETTINGS }
  }
}

// shipping rules for POST /api/orders - fee once per order, waived when the
// priced subtotal reaches the owner's free-shipping threshold (null = off)
export async function getShippingRules() {
  const settings = await getSettings()
  const fee = Number(settings.shipping_fee)
  const threshold = settings.free_shipping_threshold
  return {
    fee: Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_SETTINGS.shipping_fee,
    freeThreshold: threshold === null || threshold === undefined || threshold === ''
      ? null
      : Number(threshold),
  }
}
