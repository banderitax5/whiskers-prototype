import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { orderLimiter } from '../middleware/rateLimiter.js'
import { supabaseAdmin } from '../config/supabase.js'
import { SHIPPING_FEE_PHP } from '../utils/shopRules.js'
import { isSchemaPendingError } from '../utils/pgErrors.js'
import { validatePromo, buildDiscountAmounts, pickBestPromo } from '../utils/promoEngine.js'
import logger from '../utils/logger.js'

const router = Router()

router.use(authMiddleware)

function buildCartItemsForPromo(validatedItems, dbProducts) {
  const catMap = new Map((dbProducts || []).map((p) => [p.prod_id, p.category ?? null]))
  return validatedItems.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    unit_price: i.price,
    subtotal: i.subtotal,
    category: catMap.get(i.productId) ?? null,
  }))
}

// POST /api/orders — create a new order from cart items
// body: { items, paymentMethod, shippingFee, customerName, phone, address, promo_code }
router.post('/', orderLimiter, async (req, res) => {
  const { items, paymentMethod, customerName, phone, address, promo_code } = req.body ?? {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' })
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' })
  }

  const shipping = SHIPPING_FEE_PHP

  try {
    const productIds = items.map(i => i.productId).filter(Boolean)
    if (productIds.length === 0) {
      return res.status(400).json({ error: 'No valid product IDs provided.' })
    }

    const { data: dbProducts, error: prodErr } = await req.db
      .from('product')
      .select('prod_id, prod_name, price, stock_quantity, is_active')
      .in('prod_id', productIds)
    if (prodErr) throw prodErr

    const productMap = new Map((dbProducts || []).map(p => [p.prod_id, p]))

    let costByProduct = new Map()
    try {
      const { data: costRows, error: costErr } = await supabaseAdmin
        .from('product')
        .select('prod_id, cost_price')
        .in('prod_id', productIds)
      if (costErr) {
        if (!isSchemaPendingError(costErr)) logger.warn({ err: costErr }, 'cost snapshot fetch failed')
      } else {
        costByProduct = new Map((costRows || []).map(p => [p.prod_id, p.cost_price]))
      }
    } catch (costEx) {
      logger.warn({ err: costEx }, 'cost snapshot fetch threw')
    }

    let totalAmount = shipping
    const validatedItems = []
    for (const item of items) {
      const dbProduct = productMap.get(item.productId)
      if (!dbProduct) {
        return res.status(400).json({ error: `Product ${item.productId} not found.` })
      }
      if (dbProduct.is_active === false) {
        return res.status(400).json({ error: `"${dbProduct.prod_name}" is currently unavailable.` })
      }
      if (Number(dbProduct.stock_quantity || 0) <= 0) {
        return res.status(400).json({ error: `"${dbProduct.prod_name}" is out of stock.` })
      }
      const dbPrice = Number(dbProduct.price)
      if (!(dbPrice > 0)) {
        return res.status(400).json({ error: `"${dbProduct.prod_name}" is not yet priced and cannot be purchased.` })
      }
      const rawQty = Math.floor(Number(item.quantity))
      const qty = Number.isFinite(rawQty) && rawQty >= 1 ? rawQty : 1
      if (qty > Number(dbProduct.stock_quantity || 0)) {
        return res.status(400).json({ error: `Only ${dbProduct.stock_quantity} of "${dbProduct.prod_name}" left in stock.` })
      }
      const subtotal = dbPrice * qty
      totalAmount += subtotal
      validatedItems.push({
        ...item,
        productId: item.productId,
        price: dbPrice,
        quantity: qty,
        subtotal,
        unitCost: costByProduct.get(item.productId) ?? null,
      })
    }

    let promoResult = null
    let promoRow = null
    // category is only needed for scope matching; a fetch failure must never
    // break checkout, it only means category-scoped codes match nothing
    let promoTargets = []
    try {
      const { data: catRows } = await supabaseAdmin
        .from('product')
        .select('prod_id, category')
        .in('prod_id', productIds)
      promoTargets = (catRows || []).map((p) => ({ prod_id: p.prod_id, category: p.category ?? null }))
    } catch (catEx) {
      logger.warn({ err: catEx }, 'promo category fetch failed')
    }
    const cartItemsForPromo = buildCartItemsForPromo(validatedItems, promoTargets)

    if (promo_code && typeof promo_code === 'string') {
      const { data: promo, error: promoFetchErr } = await supabaseAdmin
        .from('promos')
        .select('*')
        .eq('code', promo_code.trim().toUpperCase())
        .maybeSingle()
      if (promoFetchErr) {
        if (isSchemaPendingError(promoFetchErr)) {
          return res.status(503).json({ error: 'Promo system is not available yet', code: 'MIGRATION_REQUIRED' })
        }
        logger.warn({ err: promoFetchErr }, 'promo fetch error')
      }
      const { data: usageRows } = await supabaseAdmin
        .from('promo_usage')
        .select('id')
        .eq('promo_code', promo_code.trim().toUpperCase())
        .eq('user_id', req.userId)
      const userUsageCount = (usageRows || []).length
      promoResult = validatePromo(promo, cartItemsForPromo, req.userId, userUsageCount)
      // an unusable code must fail loudly: charging full price after the
      // customer asked for a discount is a silent lie
      if (!promoResult.ok) {
        return res.status(400).json({ error: promoResult.error })
      }
      promoRow = promo
      totalAmount -= promoResult.discountAmount
    } else {
      // no code entered: owner-approved auto-apply - the best discount among
      // active, in-window promos wins and is charged without asking
      try {
        const nowIso = new Date().toISOString()
        const { data: activePromos, error: actErr } = await supabaseAdmin
          .from('promos')
          .select('*')
          .eq('is_active', true)
          .lte('starts_at', nowIso)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .limit(20)
        if (actErr && !isSchemaPendingError(actErr)) logger.warn({ err: actErr }, 'auto-promo fetch failed')
        if (activePromos && activePromos.length > 0) {
          const codes = activePromos.map((p) => p.code)
          const { data: usageRows } = await supabaseAdmin
            .from('promo_usage')
            .select('promo_code')
            .eq('user_id', req.userId)
            .in('promo_code', codes)
          const usageCounts = new Map()
          for (const row of usageRows || []) {
            usageCounts.set(row.promo_code, (usageCounts.get(row.promo_code) || 0) + 1)
          }
          const best = pickBestPromo(activePromos, cartItemsForPromo, req.userId, usageCounts)
          if (best && best.discountAmount > 0) {
            promoResult = best
            promoRow = best.promo
            totalAmount -= best.discountAmount
          }
        }
      } catch (autoEx) {
        // auto-apply is a courtesy: a promo outage must not block checkout
        logger.warn({ err: autoEx }, 'auto-promo apply failed, charging undiscounted total')
      }
    }

    let orderId = null
    const decremented = []
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

      const baseDetail = (i) => ({
        order_id: orderId,
        prod_id: i.productId,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })
      const snapshotDetail = (i) => ({
        ...baseDetail(i),
        unit_price: i.price,
        unit_cost: i.unitCost ?? null,
        discount_amount: 0,
      })

      let detailRows = validatedItems.map(snapshotDetail)
      if (promoResult && promoResult.lineDiscounts) {
        // buildDiscountAmounts keys on product_id (the engine's shape) - map
        // the camelCase checkout rows onto it or every lookup silently misses
        const promoItems = validatedItems.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          subtotal: i.subtotal,
        }))
        const perUnitDiscounts = buildDiscountAmounts(promoItems, promoResult.lineDiscounts)
        detailRows = validatedItems.map((i) => ({
          ...snapshotDetail(i),
          discount_amount: perUnitDiscounts.get(i.productId) || 0,
        }))
      }

      let { error: detErr } = await req.db.from('order_details').insert(detailRows)
      if (detErr && isSchemaPendingError(detErr)) {
        logger.info({ err: detErr }, 'M3 columns missing - retrying order_details insert without snapshots')
        detailRows = validatedItems.map(baseDetail)
        ;({ error: detErr } = await req.db.from('order_details').insert(detailRows))
      }
      if (detErr) throw detErr

      const { error: payErr } = await req.db.from('payment').insert({
        order_id: orderId,
        amount: totalAmount,
        method: paymentMethod,
      })
      if (payErr) throw payErr

      if (promoResult && promoRow) {
        const { error: usageErr } = await supabaseAdmin.from('promo_usage').insert({
          promo_code: promoRow.code,
          user_id: req.userId,
          order_id: orderId,
          discount_applied: promoResult.discountAmount,
        })
        if (usageErr) logger.warn({ err: usageErr }, 'promo_usage insert failed')
        await supabaseAdmin
          .from('promos')
          .update({ usage_count: promoRow.usage_count + 1 })
          .eq('code', promoRow.code)
      }

      for (const item of validatedItems) {
        const current = Number(productMap.get(item.productId).stock_quantity)
        const { data: upd, error: updErr } = await supabaseAdmin
          .from('product')
          .update({ stock_quantity: current - item.quantity })
          .eq('prod_id', item.productId)
          .gte('stock_quantity', item.quantity)
          .select('prod_id')
        if (updErr) throw updErr
        if (!upd || upd.length === 0) {
          const conflict = new Error('Insufficient stock')
          conflict.stockConflict = true
          throw conflict
        }
        decremented.push(item)
      }
    } catch (innerErr) {
      logger.error({ err: innerErr }, 'Order creation failed, cleaning up')
      if (orderId) {
        await req.db.from('payment').delete().eq('order_id', orderId)
        await req.db.from('order_details').delete().eq('order_id', orderId)
        await req.db.from('orders').delete().eq('order_id', orderId)
      }
      for (const item of decremented) {
        try {
          const { data: cur } = await supabaseAdmin
            .from('product')
            .select('stock_quantity')
            .eq('prod_id', item.productId)
            .single()
          if (cur) {
            await supabaseAdmin
              .from('product')
              .update({ stock_quantity: Number(cur.stock_quantity) + item.quantity })
              .eq('prod_id', item.productId)
          }
        } catch (restoreErr) {
          logger.error({ err: restoreErr, productId: item.productId }, 'Stock restore failed')
        }
      }
      if (promoResult && promoRow) {
        await supabaseAdmin
          .from('promo_usage')
          .delete()
          .eq('order_id', orderId)
        await supabaseAdmin
          .from('promos')
          .update({ usage_count: Math.max(0, promoRow.usage_count - 1) })
          .eq('code', promoRow.code)
      }
      throw innerErr
    }

    if (productIds.length > 0) {
      await req.db
        .from('cart_items')
        .delete()
        .in('product_id', productIds)
    }

    res.status(201).json({ order_id: orderId, status: 'Pending', total_amount: totalAmount })
  } catch (err) {
    if (err.stockConflict) {
      return res.status(409).json({ error: 'Some items just sold out. Please review your cart and try again.' })
    }
    logger.error({ err }, 'Order creation error')
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// POST /api/orders/validate-promo — check a promo code against cart items
// without creating an order. Returns the discount preview or 400 with the
// reason. Auth'd: usage limits are per user, so we need the caller's identity.
// body: { items, promo_code }
router.post('/validate-promo', orderLimiter, async (req, res) => {
  const { items, promo_code } = req.body ?? {}

  if (!promo_code || typeof promo_code !== 'string') {
    return res.status(400).json({ error: 'promo_code is required' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' })
  }

  const productIds = items.map((i) => i.productId).filter(Boolean)

  try {
    const { data: dbProducts, error: prodErr } = await supabaseAdmin
      .from('product')
      .select('prod_id, prod_name, category, price, is_active')
      .in('prod_id', productIds)
    if (prodErr) throw prodErr
    const productMap = new Map((dbProducts || []).map((p) => [p.prod_id, p]))

    const preview = []
    for (const item of items) {
      const p = productMap.get(item.productId)
      if (!p || p.is_active === false) {
        return res.status(400).json({ error: `Product ${item.productId} is not available.` })
      }
      const price = Number(p.price)
      if (!(price > 0)) {
        return res.status(400).json({ error: `"${p.prod_name}" is not yet priced and cannot be purchased.` })
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1))
      preview.push({
        product_id: item.productId,
        category: p.category ?? null,
        quantity: qty,
        unit_price: price,
        subtotal: price * qty,
      })
    }

    const { data: promo, error: promoErr } = await supabaseAdmin
      .from('promos')
      .select('*')
      .eq('code', promo_code.trim().toUpperCase())
      .maybeSingle()
    if (promoErr) {
      if (isSchemaPendingError(promoErr)) {
        return res.status(503).json({ error: 'Promo system is not available yet', code: 'MIGRATION_REQUIRED' })
      }
      throw promoErr
    }

    let userUsageCount = 0
    if (promo) {
      const { data: usageRows, error: usageErr } = await supabaseAdmin
        .from('promo_usage')
        .select('id')
        .eq('promo_code', promo.code)
        .eq('user_id', req.userId)
      if (usageErr && !isSchemaPendingError(usageErr)) throw usageErr
      userUsageCount = (usageRows || []).length
    }

    const result = validatePromo(promo, preview, req.userId, userUsageCount)
    if (!result.ok) {
      return res.status(400).json({ error: result.error })
    }
    res.json({
      ok: true,
      code: promo.code,
      discount: result.discountAmount,
      shipping_discount: result.shippingDiscount || 0,
      line_discounts: Object.fromEntries(result.lineDiscounts || new Map()),
    })
  } catch (err) {
    logger.error({ err }, 'Promo validation error')
    res.status(500).json({ error: 'Failed to validate promo code' })
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

    const { data: feedbackRows, error: fbErr } = await supabaseAdmin
      .from('feedback')
      .select('order_id, prod_id, rating, comments')
      .in('order_id', orderIds)
      .eq('id', req.userId)
    if (fbErr) logger.error({ err: fbErr }, 'feedback fetch error')

    const feedbackMap = new Map()
    for (const f of (feedbackRows || [])) {
      if (!feedbackMap.has(f.order_id)) feedbackMap.set(f.order_id, [])
      feedbackMap.get(f.order_id).push(f)
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
          prod_id: d.prod_id,
          name: prod.prod_name || 'Unknown',
          image: prod.image_url || '',
          quantity: d.quantity,
          subtotal: d.subtotal,
        }
      }),
      payment: paymentMap.get(o.order_id) || null,
      feedback: feedbackMap.get(o.order_id) || [],
    }))

    res.json({ items })
  } catch (err) {
    logger.error({ err }, 'Orders list error')
    res.status(500).json({ error: 'Failed to load orders' })
  }
})

// GET /api/orders/:id — a single order for the logged-in user
// RLS on req.db guarantees the row belongs to the caller
router.get('/:id', async (req, res) => {
  // order_id is a UUID in the schema — accept alphanumerics + dashes only
  const orderId = String(req.params.id || '').trim()
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order id' })
  }

  try {
    const { data: order, error } = await req.db
      .from('orders')
      .select('order_id, status, total_amount, created_at, customer_name, phone, address')
      .eq('order_id', orderId)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const { data: details } = await req.db
      .from('order_details')
      .select('order_id, prod_id, quantity, subtotal')
      .eq('order_id', orderId)

    const prodIds = [...new Set((details || []).map((d) => d.prod_id).filter(Boolean))]
    const { data: products } = await req.db
      .from('product')
      .select('prod_id, prod_name, image_url')
      .in('prod_id', prodIds)
    const prodMap = new Map((products || []).map((p) => [p.prod_id, p]))

    const { data: paymentRows } = await req.db
      .from('payment')
      .select('order_id, amount, method, payment_date')
      .eq('order_id', orderId)
      .limit(1)

    const { data: feedbackRows } = await supabaseAdmin
      .from('feedback')
      .select('prod_id, rating, comments, date_submittted')
      .eq('order_id', orderId)
      .eq('id', req.userId)

    res.json({
      item: {
        order_id: order.order_id,
        status: order.status,
        total_amount: order.total_amount,
        created_at: order.created_at,
        customer_name: order.customer_name,
        phone: order.phone,
        address: order.address,
        items: (details || []).map((d) => {
          const prod = prodMap.get(d.prod_id) || {}
          return {
            prod_id: d.prod_id,
            name: prod.prod_name || 'Unknown',
            image: prod.image_url || '',
            quantity: d.quantity,
            subtotal: d.subtotal,
          }
        }),
        payment: (paymentRows && paymentRows[0]) || null,
        feedback: feedbackRows || [],
      },
    })
  } catch (err) {
    logger.error({ err }, 'Order detail error')
    res.status(500).json({ error: 'Failed to load order' })
  }
})

export default router
