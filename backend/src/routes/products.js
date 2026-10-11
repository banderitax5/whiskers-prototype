import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { productLimiter } from '../middleware/rateLimiter.js'
import { isUuid } from '../utils/uuid.js'
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
      .eq('is_active', true)
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
      .eq('is_active', true)
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
      .eq('is_active', true)
    if (error) throw error
    const brands = [...new Set((data || []).map(r => r.brand).filter(Boolean))].sort()
    res.json({ items: brands })
  } catch (err) {
    logger.error({ err: err.message }, 'Brands fetch error')
    res.status(500).json({ error: 'Failed to fetch brands' })
  }
})

// explicit columns only: image_data is bytea and would come back as a huge hex
// string, so it is never selected (no product currently uses it anyway)
const BASE_COLUMNS = 'prod_id, prod_name, category, brand, price, stock_quantity, image_url, is_active, created_at'
// `description` was added by a later migration; include it when present but
// fall back to the base set so the endpoint never hard-fails if that migration
// hasn't run yet (see backend/migrations/2026-10-11_product_description_and_rls.sql)
const WITH_DESCRIPTION = `${BASE_COLUMNS}, description`

// fetches the product + its related items using the given column set
async function fetchDetail(id, columns) {
  const { data, error } = await supabaseAdmin
    .from('product')
    .select(columns)
    .eq('prod_id', id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  // missing and inactive products share the same 404 so the API never
  // distinguishes them (an inactive product should look nonexistent)
  if (!data) return null

  // related: same category, active, excluding this product, capped at 4
  let related = []
  if (data.category) {
    const { data: rel, error: relErr } = await supabaseAdmin
      .from('product')
      .select(columns)
      .eq('category', data.category)
      .eq('is_active', true)
      .neq('prod_id', id)
      .order('prod_name', { ascending: true })
      .limit(4)
    if (relErr) throw relErr
    related = rel || []
  }
  return { item: data, related }
}

// GET /api/products/:id - single product detail + related items in one round trip
// placed after the /categories and /brands static routes so those still match
router.get('/:id', async (req, res) => {
  const id = String(req.params.id || '').trim()
  if (!isUuid(id)) {
    // malformed id short-circuits before touching the database
    return res.status(404).json({ error: 'Product not found' })
  }

  try {
    let result
    try {
      result = await fetchDetail(id, WITH_DESCRIPTION)
    } catch (err) {
      // the description column does not exist yet - retry once without it so
      // the customer-facing page keeps working before the migration is run
      if (String(err.message || '').includes('description')) {
        result = await fetchDetail(id, BASE_COLUMNS)
      } else {
        throw err
      }
    }
    if (!result) return res.status(404).json({ error: 'Product not found' })
    res.json(result)
  } catch (err) {
    logger.error({ err: err.message }, 'Product detail fetch error')
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

export default router
