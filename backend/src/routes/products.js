import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'

const router = Router()

// GET /api/products - public product listing with filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
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

    if (category) query = query.eq('category', category)
    if (brand) query = query.ilike('brand', brand)
    if (search) query = query.ilike('prod_name', `%${search}%`)
    if (minPrice) query = query.gte('price', parseFloat(minPrice))
    if (maxPrice) query = query.lte('price', parseFloat(maxPrice))

    const { data, error, count } = await query
    if (error) throw error

    res.json({
      items: data || [],
      page: pg,
      pageSize: ps,
      total: count ?? 0,
    })
  } catch (err) {
    console.error('Products fetch error:', err.message)
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
    console.error('Categories fetch error:', err.message)
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
    console.error('Brands fetch error:', err.message)
    res.status(500).json({ error: 'Failed to fetch brands' })
  }
})

export default router
