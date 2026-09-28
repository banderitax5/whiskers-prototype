import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { eventLimiter } from '../middleware/rateLimiter.js'
import logger from '../utils/logger.js'

const router = Router()

const MAX_METADATA_CHARS = 4096

// POST /api/events — track a user action (page view, click, search, etc.)
// works for both anonymous and authenticated users
router.post('/', eventLimiter, async (req, res) => {
  const { event_type, page, metadata } = req.body ?? {}
  if (typeof event_type !== 'string' || typeof page !== 'string' || !event_type || !page) {
    return res.status(400).json({ error: 'event_type and page are required' })
  }
  const cleanMetadata =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  if (JSON.stringify(cleanMetadata).length > MAX_METADATA_CHARS) {
    return res.status(400).json({ error: 'metadata is too large' })
  }

  try {
    const { error } = await supabaseAdmin.from('events').insert({
      event_type: event_type.slice(0, 50),
      page: page.slice(0, 200),
      metadata: cleanMetadata,
      user_id: req.userId || null,
    })
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Event tracking error')
    res.json({ ok: true }) // silent fail — never block the user
  }
})

export default router
