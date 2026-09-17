import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { orderLimiter } from '../middleware/rateLimiter.js'
import logger from '../utils/logger.js'

const router = Router()

router.use(authMiddleware)

// POST /api/orders — create a new order from cart items
// body: { items, paymentMethod, shippingFee, customerName, phone, address }
router.post('/', orderLimiter, async (req, res) => {
  const { items, paymentMethod, shippingFee = 75, customerName, phone, address } = req.body ?? {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' })
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' })
  }

  try {
    // fetch actual prices from the DB — never trust client-sent prices
    const productIds = items.map(i => i.productId).filter(Boolean)
    if (productIds.length === 0) {
      return res.status(400).json({ error: 'No valid product IDs provided.' })
    }

    const { data: dbProducts, error: prodErr } = await req.db
      .from('product')
      .select('prod_id, price')
      .in('prod_id', productIds)
    if (prodErr) throw prodErr

    const priceMap = new Map((dbProducts || []).map(p => [p.prod_id, Number(p.price)]))

    // validate every item exists and compute the real total
    let totalAmount = Number(shippingFee) || 0
    const validatedItems = []
    for (const item of items) {
      const dbPrice = priceMap.get(item.productId)
      if (dbPrice == null) {
        return res.status(400).json({ error: `Product ${item.productId} not found.` })
      }
      const qty = Math.max(1, Number(item.quantity) || 1)
      const subtotal = dbPrice * qty
      totalAmount += subtotal
      validatedItems.push({ ...item, productId: item.productId, price: dbPrice, quantity: qty, subtotal })
    }

    // insert order + details + payment, clean up on partial failure
    let orderId = null
    try {
      const { data: order, error: orderErr } = await req.db
        .from('orders')
        .insert({
          id: req.userId,
          prod_id: validatedItems[0].productId,
          orderDate: new Date().toISOString(),
          status: 'Pending',
          total_amount: totalAmount,
          customer_name: customerName || '',
          phone: phone || '',
          address: address || '',
        })
        .select('order_id')
        .single()
      if (orderErr) throw orderErr
      orderId = order.order_id

      const details = validatedItems.map(i => ({
        order_id: orderId,
        prod_id: i.productId,
        quantity: i.quantity,
        subtotal: i.subtotal,
      }))
      const { error: detErr } = await req.db.from('order_details').insert(details)
      if (detErr) throw detErr

      const { error: payErr } = await req.db.from('payment').insert({
        order_id: orderId,
        amount: totalAmount,
        method: paymentMethod,
      })
      if (payErr) throw payErr
    } catch (innerErr) {
      // partial failure — clean up any rows that were created
      logger.error({ err: innerErr }, 'Order creation failed, cleaning up')
      if (orderId) {
        await req.db.from('payment').delete().eq('order_id', orderId)
        await req.db.from('order_details').delete().eq('order_id', orderId)
        await req.db.from('orders').delete().eq('order_id', orderId)
      }
      throw innerErr
    }

    // clear purchased items from the cart
    if (productIds.length > 0) {
      await req.db
        .from('cart_items')
        .delete()
        .in('product_id', productIds)
    }

    res.status(201).json({ order_id: orderId, status: 'Pending', total_amount: totalAmount })
  } catch (err) {
    logger.error({ err }, 'Order creation error')
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// GET /api/orders — return the logged-in user's order history
router.get('/', async (req, res) => {
  try {
    const { data: orders, error } = await req.db
      .from('orders')
      .select('order_id, status, total_amount, created_at, customer_name, phone, address')
      .order('created_at', { ascending: false })
    if (error) throw error

    const orderIds = (orders || []).map((o) => o.order_id)

    const { data: details, error: detailsErr } = await req.db
      .from('order_details')
      .select('order_id, prod_id, quantity, subtotal')
      .in('order_id', orderIds)
    if (detailsErr) logger.error({ err: detailsErr }, 'order_details fetch error')

    const prodIds = [...new Set((details || []).map(d => d.prod_id).filter(Boolean))]
    const { data: products } = await req.db
      .from('product')
      .select('prod_id, prod_name, image_url')
      .in('prod_id', prodIds)
    const prodMap = new Map((products || []).map(p => [p.prod_id, p]))

    const detailsMap = new Map()
    for (const d of (details || [])) {
      if (!detailsMap.has(d.order_id)) detailsMap.set(d.order_id, [])
      detailsMap.get(d.order_id).push(d)
    }

    const { data: payments } = await req.db
      .from('payment')
      .select('order_id, amount, method, payment_date')
      .in('order_id', orderIds)

    const paymentMap = new Map()
    for (const p of (payments || [])) {
      if (!paymentMap.has(p.order_id)) paymentMap.set(p.order_id, p)
    }

    const items = (orders || []).map((o) => ({
      order_id: o.order_id,
      status: o.status,
      total_amount: o.total_amount,
      created_at: o.created_at,
      customer_name: o.customer_name,
      phone: o.phone,
      address: o.address,
      items: (detailsMap.get(o.order_id) || []).map((d) => {
        const prod = prodMap.get(d.prod_id) || {}
        return {
          name: prod.prod_name || 'Unknown',
          image: prod.image_url || '',
          quantity: d.quantity,
          subtotal: d.subtotal,
        }
      }),
      payment: paymentMap.get(o.order_id) || null,
    }))

    res.json({ items })
  } catch (err) {
    logger.error({ err }, 'Orders list error')
    res.status(500).json({ error: 'Failed to load orders' })
  }
})

export default router
