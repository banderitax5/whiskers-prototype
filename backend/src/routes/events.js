import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import logger from '../utils/logger.js'

const router = Router()

// POST /api/events — track a user action (page view, click, search, etc.)
// works for both anonymous and authenticated users
router.post('/', async (req, res) => {
  const { event_type, page, metadata } = req.body ?? {}
  if (!event_type || !page) {
    return res.status(400).json({ error: 'event_type and page are required' })
  }

  try {
    const { error } = await supabaseAdmin.from('events').insert({
      event_type: event_type.slice(0, 50),
      page: page.slice(0, 200),
      metadata: metadata || {},
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
