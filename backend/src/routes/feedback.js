import { Router } from 'express'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../config/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { feedbackLimiter } from '../middleware/rateLimiter.js'
import { isUuid } from '../utils/uuid.js'
import logger from '../utils/logger.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PUBLIC: GET /api/feedback/product/:prodId — all reviews for a product
// no auth required; returns ratings, comments, dates, and reviewer names
router.get('/product/:prodId', async (req, res) => {
  const prodId = String(req.params.prodId || '').trim()
  if (!isUuid(prodId)) {
    return res.status(404).json({ error: 'Product not found' })
  }
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(20, Math.max(1, parseInt(req.query.pageSize) || 10))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('feedback')
      .select(
        'feed_id, rating, comments, date_submittted, id',
        { count: 'exact' }
      )
      .eq('prod_id', prodId)
      .order('date_submittted', { ascending: false })
      .range(from, to)

    if (error) throw error

    // hydrate reviewer names from profiles (service role can read encrypted names)
    const userIds = [...new Set((data || []).map(r => r.id).filter(Boolean))]
    let nameMap = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds)
      if (profiles) {
        for (const p of profiles) {
          const fn = p.first_name || ''
          const ln = p.last_name || ''
          nameMap[p.id] = (fn || ln) ? `${fn} ${ln}`.trim() : 'Anonymous'
        }
      }
    }

    const items = (data || []).map(r => ({
      ...r,
      reviewer_name: nameMap[r.id] || 'Anonymous',
    }))

    res.json({ items, page, pageSize, total: count ?? 0 })
  } catch (err) {
    logger.error({ err: err.message }, 'Public product reviews fetch error')
    res.status(500).json({ error: 'Failed to load reviews' })
  }
})

// private routes below require auth
router.use(authMiddleware)
router.use(feedbackLimiter)

// POST /api/feedback — save product reviews for the caller's own order
// body: { orderId, items: [{ prodId, rating, comments? }] }
// re-reviewing the same product in the same order updates the existing row
router.post('/', feedbackLimiter, async (req, res) => {
  const { orderId, items } = req.body ?? {}
  if (!UUID_RE.test(String(orderId || ''))) {
    return res.status(400).json({ error: 'orderId must be a valid order id' })
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return res.status(400).json({ error: 'items must contain between 1 and 20 reviews' })
  }
  for (const it of items) {
    const rating = Number(it?.rating)
    if (!UUID_RE.test(String(it?.prodId || ''))) {
      return res.status(400).json({ error: 'Each review needs a valid product id' })
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Ratings must be whole numbers from 1 to 5' })
    }
    if (it.comments != null && (typeof it.comments !== 'string' || it.comments.length > 1000)) {
      return res.status(400).json({ error: 'Comments must be text of at most 1000 characters' })
    }
  }

  try {
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('order_id')
      .eq('order_id', orderId)
      .eq('id', req.userId)
      .maybeSingle()
    if (orderErr) throw orderErr
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const prodIds = [...new Set(items.map((it) => it.prodId))]
    const { data: products } = await supabaseAdmin
      .from('product')
      .select('prod_id')
      .in('prod_id', prodIds)
    const known = new Set((products || []).map((p) => p.prod_id))
    const missing = prodIds.find((id) => !known.has(id))
    if (missing) return res.status(400).json({ error: 'One or more products do not exist' })

    let inserted = 0
    let updated = 0
    for (const it of items) {
      const { data: existing } = await supabaseAdmin
        .from('feedback')
        .select('feed_id')
        .eq('order_id', orderId)
        .eq('prod_id', it.prodId)
        .limit(1)
      const row = {
        rating: Number(it.rating),
        comments: (it.comments || '').trim() || null,
        date_submittted: new Date().toISOString(),
      }
      if (existing && existing.length > 0) {
        const { error } = await supabaseAdmin
          .from('feedback')
          .update(row)
          .eq('feed_id', existing[0].feed_id)
        if (error) throw error
        updated += 1
      } else {
        const { error } = await supabaseAdmin.from('feedback').insert({
          feed_id: randomUUID(),
          id: req.userId,
          order_id: orderId,
          prod_id: it.prodId,
          ...row,
        })
        if (error) throw error
        inserted += 1
      }
    }
    res.status(201).json({ inserted, updated, message: 'Reviews saved' })
  } catch (err) {
    logger.error({ err }, 'Feedback save error')
    res.status(500).json({ error: 'Could not save reviews' })
  }
})

// GET /api/feedback?orderId= — the caller's reviews for one of their orders
router.get('/', async (req, res) => {
  const orderId = String(req.query.orderId || '')
  if (!UUID_RE.test(orderId)) {
    return res.status(400).json({ error: 'orderId query parameter is required' })
  }
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_id')
      .eq('order_id', orderId)
      .eq('id', req.userId)
      .maybeSingle()
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const { data, error } = await supabaseAdmin
      .from('feedback')
      .select('prod_id, rating, comments, date_submittted')
      .eq('order_id', orderId)
      .eq('id', req.userId)
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Feedback list error')
    res.status(500).json({ error: 'Could not load reviews' })
  }
})

export default router
