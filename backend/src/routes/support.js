import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import logger from '../utils/logger.js'

const router = Router()
router.use(authMiddleware)

// POST /api/support — the account's support thread
// supports.support_id is a primary key referencing the auth user id, so each
// account holds a single thread: the first message creates it, later messages
// replace it (and clear any previous reply — the reply has been read by then).
router.post('/', async (req, res) => {
  const message = String(req.body?.message || '').trim()
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: 'Message must be between 1 and 2000 characters' })
  }
  try {
    const { data: existing } = await supabaseAdmin
      .from('supports')
      .select('support_id')
      .eq('support_id', req.userId)
      .maybeSingle()

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('supports')
        .update({ message, response: null, date_submitted: new Date().toISOString() })
        .eq('support_id', req.userId)
        .select()
        .single()
      if (error) throw error
      return res.json({ item: data, replaced: true })
    }

    const { data, error } = await supabaseAdmin
      .from('supports')
      .insert({
        support_id: req.userId,
        id: req.userId,
        message,
        response: null,
        date_submitted: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw error
    res.status(201).json({ item: data })
  } catch (err) {
    logger.error({ err }, 'Support submit error')
    res.status(500).json({ error: 'Could not send your message' })
  }
})

// GET /api/support — the caller's own cases with any staff replies
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('supports')
      .select('support_id, message, response, date_submitted')
      .eq('id', req.userId)
      .order('date_submitted', { ascending: false })
      .limit(100)
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Support list error')
    res.status(500).json({ error: 'Could not load your messages' })
  }
})

export default router
