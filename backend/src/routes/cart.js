import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { supabaseAdmin } from '../config/supabase.js'

const router = Router()

// every cart route needs the user to be logged in
// authMiddleware checks the Bearer token and attaches userId to req
router.use(authMiddleware)

// grabs all items in the logged in user's cart from the cart_items table
// returns them sorted by when they were added (oldest first)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: true })

    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    console.error('Cart fetch failed:', err.message)
    res.status(500).json({ error: 'Failed to load cart' })
  }
})

// adds a product to the user's cart
// if the product is already in the cart, it bumps the quantity instead of making a duplicate
// the frontend sends productId, name, price, image, collection, brand, and quantity
router.post('/', async (req, res) => {
  const { productId, name, price, image, collection, brand, quantity } = req.body ?? {}
  if (!productId || !name || price == null) {
    return res.status(400).json({ error: 'productId, name, and price are required' })
  }

  // make sure quantity is at least 1
  const qty = Math.max(1, Number(quantity) || 1)

  try {
    // check if this product is already sitting in the user's cart
    const { data: existing } = await supabaseAdmin
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', req.userId)
      .eq('product_id', productId)
      .single()

    // product already exists so just add to the existing quantity
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('cart_items')
        .update({ quantity: existing.quantity + qty })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return res.json({ item: data })
    }

    // brand new product for this user's cart, insert a fresh row
    const { data, error } = await supabaseAdmin
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
    console.error('Cart add failed:', err.message)
    res.status(500).json({ error: 'Failed to add item to cart' })
  }
})

// updates the quantity for a specific product in the user's cart
// the productId comes from the URL param, and the new quantity comes from the body
router.put('/:productId', async (req, res) => {
  const productId = Number(req.params.productId)
  const { quantity } = req.body ?? {}
  const qty = Math.max(1, Number(quantity) || 1)

  try {
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .update({ quantity: qty })
      .eq('user_id', req.userId)
      .eq('product_id', productId)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Item not found in cart' })
    res.json({ item: data })
  } catch (err) {
    console.error('Cart update failed:', err.message)
    res.status(500).json({ error: 'Failed to update cart item' })
  }
})

// removes items from the user's cart
// if the body has a productIds array, only those products get deleted
// if the body is empty or missing productIds, the entire cart gets wiped
router.delete('/', async (req, res) => {
  const { productIds } = req.body ?? {}

  try {
    let query = supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('user_id', req.userId)

    // only delete specific products if the frontend sent an array of ids
    if (Array.isArray(productIds) && productIds.length > 0) {
      query = query.in('product_id', productIds)
    }

    const { error } = await query
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('Cart delete failed:', err.message)
    res.status(500).json({ error: 'Failed to remove cart items' })
  }
})

export default router
