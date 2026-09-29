import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { productLimiter } from '../middleware/rateLimiter.js'
import logger from '../utils/logger.js'

const router = Router()

router.use(productLimiter)

// strips ILIKE wildcard characters and limits length to prevent abuse
function sanitizeSearch(input) {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(/[%_]/g, '').trim()
  if (!cleaned || cleaned.length < 1) return null
  return cleaned.slice(0, 100)
}

// validates a price string, returns a finite number or null
function parsePrice(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : null
}

// GET /api/products - public product listing with filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 1000,
      category,
      brand,
      search,
      minPrice,
      maxPrice,
    } = req.query

    const pg = Math.max(1, parseInt(page) || 1)
    const ps = Math.min(1000, Math.max(1, parseInt(pageSize) || 50))
    const from = (pg - 1) * ps
    const to = from + ps - 1

    let query = supabaseAdmin
      .from('product')
      .select('*', { count: 'exact' })
      .order('prod_name', { ascending: true })
      .range(from, to)

    if (category && typeof category === 'string' && category.length <= 100) {
      query = query.eq('category', category)
    }
    if (brand && typeof brand === 'string' && brand.length <= 100) {
      query = query.ilike('brand', brand)
    }
    const sanitized = sanitizeSearch(search)
    if (sanitized) {
      query = query.ilike('prod_name', `%${sanitized}%`)
    }
    const min = parsePrice(minPrice)
    const max = parsePrice(maxPrice)
    if (min != null) query = query.gte('price', min)
    if (max != null) query = query.lte('price', max)

    const { data, error, count } = await query
    if (error) throw error

    res.json({
      items: data || [],
      page: pg,
      pageSize: ps,
      total: count ?? 0,
    })
  } catch (err) {
    logger.error({ err: err.message }, 'Products fetch error')
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET /api/products/categories - distinct categories for filter UI
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .select('category')
    if (error) throw error
    const cats = [...new Set((data || []).map(r => r.category).filter(Boolean))].sort()
    res.json({ items: cats })
  } catch (err) {
    logger.error({ err: err.message }, 'Categories fetch error')
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// GET /api/products/brands - distinct brands for filter UI
router.get('/brands', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .select('brand')
    if (error) throw error
    const brands = [...new Set((data || []).map(r => r.brand).filter(Boolean))].sort()
    res.json({ items: brands })
  } catch (err) {
    logger.error({ err: err.message }, 'Brands fetch error')
    res.status(500).json({ error: 'Failed to fetch brands' })
  }
})

export default router
