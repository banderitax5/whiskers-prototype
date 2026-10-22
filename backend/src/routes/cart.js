import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { cartLimiter } from '../middleware/rateLimiter.js'
import { supabaseAdmin } from '../config/supabase.js'
import { isUuid } from '../utils/uuid.js'
import { normalizeQuantity, MAX_LINE_QUANTITY } from '../utils/shopRules.js'
import logger from '../utils/logger.js'

const router = Router()

// every cart route needs the user to be logged in
router.use(authMiddleware, cartLimiter)

// columns the cart snapshot is allowed to carry; all of them are recomputed
// from the product table so the client can never set its own price or name
const PRODUCT_COLUMNS = 'prod_id, prod_name, price, image_url, brand, category, stock_quantity, is_active'

// loads the live product row through the user-scoped client. RLS hides
// inactive products from customers, so a null row also covers that case.
async function loadPurchasableProduct(req, productId) {
  const { data, error } = await req.db
    .from('product')
    .select(PRODUCT_COLUMNS)
    .eq('prod_id', productId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.is_active === false) {
    return { status: 404, error: 'Product not found or no longer available' }
  }
  const price = Number(data.price)
  if (!(price > 0)) {
    return { status: 400, error: `"${data.prod_name}" is not yet priced and cannot be added to the cart` }
  }
  const stock = Number(data.stock_quantity || 0)
  if (stock <= 0) {
    return { status: 400, error: `"${data.prod_name}" is out of stock` }
  }
  return { product: data, price, stock }
}

// reshapes a live product row into the cart_items snapshot columns
function snapshotFromProduct(product, quantity) {
  return {
    product_id: product.prod_id,
    name: product.prod_name,
    price: Number(product.price),
    image: product.image_url || '',
    collection: product.category || '',
    brand: product.brand || '',
    quantity,
  }
}

// grabs all items in the logged in user's cart
router.get('/', async (req, res) => {
  try {
    const { data, error } = await req.db
      .from('cart_items')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err: err.message }, 'Cart fetch failed')
    res.status(500).json({ error: 'Failed to load cart' })
  }
})

// adds a product to the user's cart
// the client only sends { productId, quantity } — name/price/image always
// come from the product table so a tampered request cannot poison the cart
router.post('/', async (req, res) => {
  const { productId } = req.body ?? {}
  if (!isUuid(productId)) {
    return res.status(400).json({ error: 'A valid productId is required' })
  }

  try {
    const loaded = await loadPurchasableProduct(req, productId)
    if (loaded.error) return res.status(loaded.status).json({ error: loaded.error })
    const { product, stock } = loaded
    const qty = normalizeQuantity(req.body?.quantity, stock)

    // atomic upsert: merge on conflict (user_id, product_id)
    const snapshot = { user_id: req.userId, ...snapshotFromProduct(product, qty) }
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .upsert(snapshot, {
        onConflict: 'user_id,product_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) {
      // if upsert somehow fails (e.g., stock check needed), fall back to merge
      if (error.code === '23505') {
        const { data: row } = await req.db
          .from('cart_items')
          .select('id, quantity')
          .eq('product_id', productId)
          .maybeSingle()
        if (row) {
          const merged = Math.min(Number(row.quantity || 0) + qty, stock)
          const { data: updated, error: updErr } = await supabaseAdmin
            .from('cart_items')
            .update(snapshotFromProduct(product, merged))
            .eq('id', row.id)
            .eq('user_id', req.userId)
            .select()
            .single()
          if (updErr) throw updErr
          return res.json({ item: updated })
        }
      }
      throw error
    }
    res.status(201).json({ item: data })
  } catch (err) {
    logger.error({ err: err.message }, 'Cart add failed')
    res.status(500).json({ error: 'Failed to add item to cart' })
  }
})

// updates the quantity for a specific product in the user's cart
router.put('/:productId', async (req, res) => {
  const productId = String(req.params.productId || '').trim()
  if (!isUuid(productId)) {
    return res.status(400).json({ error: 'Invalid product id' })
  }

  try {
    // fresh stock read via service-role (bypasses RLS) to avoid stale cache
    const { data: product, error: prodErr } = await supabaseAdmin
      .from('product')
      .select('prod_id, prod_name, price, stock_quantity, is_active')
      .eq('prod_id', productId)
      .maybeSingle()
    if (prodErr) throw prodErr
    if (!product || product.is_active === false) {
      return res.status(404).json({ error: 'Product not found or no longer available' })
    }
    const price = Number(product.price)
    if (!(price > 0)) {
      return res.status(400).json({ error: `"${product.prod_name}" is not yet priced and cannot be added to the cart` })
    }
    const stock = Number(product.stock_quantity || 0)
    if (stock <= 0) {
      return res.status(400).json({ error: `"${product.prod_name}" is out of stock` })
    }

    const raw = Math.floor(Number(req.body?.quantity))
    if (!Number.isFinite(raw) || raw < 1) {
      return res.status(400).json({ error: 'quantity must be a whole number of 1 or more' })
    }
    if (raw > stock) {
      return res.status(400).json({ error: `Only ${stock} left in stock` })
    }

    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .update({ quantity: Math.min(raw, MAX_LINE_QUANTITY) })
      .eq('product_id', productId)
      .eq('user_id', req.userId)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Item not found in cart' })
    }
    res.json({ item: { product_id: productId, quantity: Math.min(raw, stock) } })
  } catch (err) {
    logger.error({ err: err.message }, 'Cart update failed')
    res.status(500).json({ error: 'Failed to update cart item' })
  }
})

// removes specific items from the user's cart
router.delete('/', async (req, res) => {
  const { productIds } = req.body ?? {}

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: 'productIds array is required' })
  }

  try {
    const { error } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('user_id', req.userId)
      .in('product_id', productIds)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err.message }, 'Cart delete failed')
    res.status(500).json({ error: 'Failed to remove cart items' })
  }
})

export default router
