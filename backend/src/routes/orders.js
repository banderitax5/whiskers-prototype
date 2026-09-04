import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { supabaseAdmin } from '../config/supabase.js'

const router = Router()

router.use(authMiddleware)

// POST /api/orders — create a new order from cart items
// body: { items, paymentMethod, shippingFee, customerName, phone, address }
router.post('/', async (req, res) => {
  const { items, paymentMethod, shippingFee = 75, customerName, phone, address } = req.body ?? {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' })
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' })
  }

  try {
    const totalAmount = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0) + shippingFee

    // resolve product IDs — fall back to name lookup if productId is missing
    const resolvedItems = await Promise.all(items.map(async (i) => {
      if (i.productId) return i
      const { data: match } = await supabaseAdmin
        .from('product')
        .select('prod_id')
        .ilike('prod_name', i.name)
        .limit(1)
        .maybeSingle()
      return { ...i, productId: match?.prod_id || null }
    }))

    const firstProductId = resolvedItems[0]?.productId
    if (!firstProductId) {
      return res.status(400).json({ error: 'Could not resolve product IDs. Please re-add items to your cart.' })
    }

    // create the order row (prod_id and orderDate are legacy but required by the table)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        id: req.userId,
        prod_id: firstProductId,
        orderDate: new Date().toISOString(),
        status: 'Pending',
        total_amount: totalAmount,
        customer_name: customerName || '',
        phone: phone || '',
        address: address || '',
      })
      .select('order_id')
      .single()
    if (orderErr) {
      console.error('Supabase orders insert error:', JSON.stringify(orderErr))
      throw orderErr
    }

    // create order_details for each line item (skip items without resolved product IDs)
    const details = resolvedItems
      .filter((i) => i.productId)
      .map((i) => ({
        order_id: order.order_id,
        prod_id: i.productId,
        quantity: Number(i.quantity),
        subtotal: Number(i.price) * Number(i.quantity),
      }))
    if (details.length > 0) {
      const { error: detErr } = await supabaseAdmin
        .from('order_details')
        .insert(details)
      if (detErr) {
        console.error('Supabase order_details insert error:', JSON.stringify(detErr))
        throw detErr
      }
    }

    // create the payment record
    const { error: payErr } = await supabaseAdmin
      .from('payment')
      .insert({
        order_id: order.order_id,
        amount: totalAmount,
        method: paymentMethod,
      })
    if (payErr) {
      console.error('Supabase payment insert error:', JSON.stringify(payErr))
      throw payErr
    }

    // clear the purchased products from the cart
    const productIds = items.map((i) => i.productId).filter(Boolean)
    if (productIds.length > 0) {
      await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('user_id', req.userId)
        .in('product_id', productIds)
    }

    // also clear any cart items with null product_id that match by name
    const itemNames = items.map((i) => i.name).filter(Boolean)
    if (itemNames.length > 0) {
      await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('user_id', req.userId)
        .is('product_id', null)
        .in('name', itemNames)
    }

    res.status(201).json({ order_id: order.order_id, status: 'Pending', total_amount: totalAmount })
  } catch (err) {
    console.error('Order creation error:', err)
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// GET /api/orders — return the logged-in user's order history
router.get('/', async (req, res) => {
  try {
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('order_id, status, total_amount, created_at, customer_name, phone, address')
      .eq('id', req.userId)
      .order('created_at', { ascending: false })
    if (error) throw error

    const orderIds = (orders || []).map((o) => o.order_id)

    const { data: details, error: detailsErr } = await supabaseAdmin
      .from('order_details')
      .select('order_id, prod_id, quantity, subtotal')
      .in('order_id', orderIds)
    if (detailsErr) console.error('order_details fetch error:', detailsErr)

    const prodIds = [...new Set((details || []).map(d => d.prod_id).filter(Boolean))]
    const { data: products } = await supabaseAdmin
      .from('product')
      .select('prod_id, prod_name, image_url')
      .in('prod_id', prodIds)
    const prodMap = new Map((products || []).map(p => [p.prod_id, p]))

    const detailsMap = new Map()
    for (const d of (details || [])) {
      if (!detailsMap.has(d.order_id)) detailsMap.set(d.order_id, [])
      detailsMap.get(d.order_id).push(d)
    }

    const { data: payments } = await supabaseAdmin
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
    console.error('Orders list error:', err)
    res.status(500).json({ error: 'Failed to load orders' })
  }
})

export default router
