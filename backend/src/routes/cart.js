import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { cartLimiter } from '../middleware/rateLimiter.js'
import logger from '../utils/logger.js'

const router = Router()

// every cart route needs the user to be logged in
router.use(authMiddleware, cartLimiter)

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
router.post('/', async (req, res) => {
  const { productId, name, price, image, collection, brand, quantity } = req.body ?? {}
  if (!productId || !name || price == null) {
    return res.status(400).json({ error: 'productId, name, and price are required' })
  }

  const qty = Math.max(1, Number(quantity) || 1)

  try {
    // check if this product is already in the user's cart
    const { data: existing } = await req.db
      .from('cart_items')
      .select('id, quantity')
      .eq('product_id', productId)
      .single()

    if (existing) {
      const { data, error } = await req.db
        .from('cart_items')
        .update({ quantity: existing.quantity + qty })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return res.json({ item: data })
    }

    const { data, error } = await req.db
      .from('cart_items')
      .insert({
        user_id: req.userId,
        product_id: productId,
        name,
        price: Number(price),
        image: image || '',
        collection: collection || '',
        brand: brand || '',
        quantity: qty,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ item: data })
  } catch (err) {
    logger.error({ err: err.message }, 'Cart add failed')
    res.status(500).json({ error: 'Failed to add item to cart' })
  }
})

// updates the quantity for a specific product in the user's cart
router.put('/:productId', async (req, res) => {
  const productId = String(req.params.productId || '').trim()
  if (!productId || productId.length > 64) {
    return res.status(400).json({ error: 'Invalid product id' })
  }
  const { quantity } = req.body ?? {}
  const qty = Math.max(1, Number(quantity) || 1)

  try {
    const { data, error } = await req.db
      .from('cart_items')
      .update({ quantity: qty })
      .eq('product_id', productId)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Item not found in cart' })
    }
    res.json({ item: { product_id: productId, quantity: qty } })
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
    const { error } = await req.db
      .from('cart_items')
      .delete()
      .in('product_id', productIds)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err.message }, 'Cart delete failed')
    res.status(500).json({ error: 'Failed to remove cart items' })
  }
})

export default router
