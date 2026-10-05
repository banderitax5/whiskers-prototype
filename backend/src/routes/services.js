import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import logger from '../utils/logger.js'

const router = Router()

// GET /api/services - public catalog of bookable services (active rows only)
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('services')
      .select('service_id, name, description, price, duration_minutes')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Services list error')
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
