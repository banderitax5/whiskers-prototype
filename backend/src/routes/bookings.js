import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { bookingLimiter } from '../middleware/rateLimiter.js'
import { supabaseAdmin } from '../config/supabase.js'
import logger from '../utils/logger.js'

const router = Router()

// GET /api/bookings - the signed-in user's own bookings, newest first
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('booking_id, service_id, service_name, preferred_date, notes, status, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Bookings list error')
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/bookings - book an active service for a future date
router.post('/', authMiddleware, bookingLimiter, async (req, res) => {
  const serviceId = String(req.body?.serviceId ?? '').trim()
  const preferredDate = String(req.body?.preferredDate ?? '').trim()
  const notes = String(req.body?.notes ?? '').trim()

  if (!/^[0-9a-f-]{36}$/i.test(serviceId)) {
    return res.status(400).json({ error: 'serviceId must be a valid id' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    return res.status(400).json({ error: 'preferredDate must be YYYY-MM-DD' })
  }
  const today = new Date().toISOString().slice(0, 10)
  if (preferredDate < today) {
    return res.status(400).json({ error: 'preferredDate must be today or later' })
  }
  if (notes.length > 1000) {
    return res.status(400).json({ error: 'notes must be 1000 characters or fewer' })
  }

  try {
    const { data: service, error: svcErr } = await supabaseAdmin
      .from('services')
      .select('service_id, name, is_active')
      .eq('service_id', serviceId)
      .single()
    if (svcErr || !service || service.is_active === false) {
      return res.status(404).json({ error: 'Service not found' })
    }

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .insert({
        user_id: req.userId,
        service_id: service.service_id,
        service_name: service.name,
        preferred_date: preferredDate,
        notes,
      })
      .select('booking_id, service_id, service_name, preferred_date, notes, status, created_at')
      .single()
    if (error) throw error
    res.status(201).json({ item: data })
  } catch (err) {
    logger.error({ err }, 'Booking create error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/bookings/:id - the owner cancels their own booking
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('bookings')
      .select('booking_id, user_id, status')
      .eq('booking_id', req.params.id)
      .single()
    if (findErr || !existing) {
      return res.status(404).json({ error: 'Booking not found' })
    }
    if (existing.user_id !== req.userId) {
      return res.status(404).json({ error: 'Booking not found' })
    }
    if (!['Pending', 'Approved'].includes(existing.status)) {
      return res.status(400).json({ error: `A ${existing.status.toLowerCase()} booking cannot be cancelled` })
    }

    const { data, error } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'Cancelled' })
      .eq('booking_id', req.params.id)
      .select('booking_id, status')
      .single()
    if (error) throw error
    res.json({ item: data })
  } catch (err) {
    logger.error({ err }, 'Booking cancel error')
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
