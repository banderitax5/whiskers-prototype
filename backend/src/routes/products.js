import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { productLimiter } from '../middleware/rateLimiter.js'
import { isUuid } from '../utils/uuid.js'
import { missingColumnOf } from '../utils/pgErrors.js'
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

    // explicit column list (never *): image_data and the costing columns must
    // not leave through the public API. description/details shed on a database
    // that has not run their migration, same as the detail endpoint below.
    let columns = [...PUBLIC_COLUMNS]
    let result = null
    for (;;) {
      let query = supabaseAdmin
        .from('product')
        .select(columns.join(', '), { count: 'exact' })
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

      try {
        const { data, error, count } = await query
        if (error) throw error
        result = { data, count }
        break
      } catch (err) {
        const optional = columns.filter((c) => OPTIONAL_COLUMNS.includes(c))
        const missing = optional.length ? missingColumnOf(err, optional) : null
        if (!missing || !columns.includes(missing)) throw err
        columns = columns.filter((c) => c !== missing)
      }
    }

    res.json({
      items: result?.data || [],
      page: pg,
      pageSize: ps,
      total: result?.count ?? 0,
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

// explicit columns only: the public API never exposes image_data (bytea) or
// the Phase 2 costing columns (cost_price/supplier/archived_at), even though
// the anon key + table grants would otherwise make them reachable.
// columns added by later migrations sit in OPTIONAL_COLUMNS; the endpoints
// shed them and retry so a pending migration degrades the payload instead of
// 500-ing (see backend/migrations/2026-10-11_product_description_and_rls.sql
// and backend/migrations/2026-10-11_product_info_sections.sql)
const REQUIRED_COLUMNS = [
  'prod_id', 'prod_name', 'category', 'brand', 'price',
  'stock_quantity', 'image_url', 'is_active', 'created_at',
]
const OPTIONAL_COLUMNS = ['description', 'details']
const PUBLIC_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]

// PostgREST/PGRST and plain SQL both name the offending column, but the wording
// differs, so match either shape before deciding this is a missing-column error
// (moved to utils/pgErrors.js — see missingColumnOf)

// fetches the product + its related items using the given column list
async function fetchDetail(id, columns) {
  const select = columns.join(', ')
  const { data, error } = await supabaseAdmin
    .from('product')
    .select(select)
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
      .select(select)
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
    let columns = [...PUBLIC_COLUMNS]
    let result = null
    // retry, shedding one unavailable optional column at a time, so a pending
    // migration degrades the payload instead of 500-ing the page
    for (;;) {
      try {
        result = await fetchDetail(id, columns)
        break
      } catch (err) {
        const optional = columns.filter((c) => OPTIONAL_COLUMNS.includes(c))
        const missing = optional.length ? missingColumnOf(err, optional) : null
        if (!missing || !columns.includes(missing)) throw err
        if (columns.length <= REQUIRED_COLUMNS.length) throw err
        columns = columns.filter((c) => c !== missing)
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
