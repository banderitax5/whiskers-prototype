import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { orderLimiter, payLimiter } from '../middleware/rateLimiter.js'
import { supabaseAdmin } from '../config/supabase.js'
import { getShippingRules } from '../utils/shopSettings.js'
import { sendOrderReceipt, maskEmail } from '../utils/mailer.js'
import { isSchemaPendingError } from '../utils/pgErrors.js'
import { validatePromo, buildDiscountAmounts, pickBestPromo } from '../utils/promoEngine.js'
import { normalizeMobilePhone, sanitizeAddressLine, buildOrderAddress } from '../utils/addressRules.js'
import {
  isGatewayMethod,
  isGatewayOrderDue,
  expireGatewayOrder,
  sweepGatewayExpiry,
  loadReceiptPayload,
  settleGatewayPayment,
  cancelGatewayOrder,
} from '../utils/gatewayPayment.js'
import { payMongoConfigured, createCheckoutSession, siteUrl } from '../utils/payMongo.js'
import { logAudit } from './admin.js'
import logger from '../utils/logger.js'

const router = Router()

router.use(authMiddleware)

const PAYMENT_COLUMNS_BASE = 'order_id, amount, method, payment_date'

// payment read that sheds the gateway lifecycle columns before the migration
// lands (same pattern as the M3 order_details fallback)
async function fetchPayments(queryFn) {
  let res = await queryFn(`${PAYMENT_COLUMNS_BASE}, status, paid_at`)
  if (res.error && isSchemaPendingError(res.error)) {
    res = await queryFn(PAYMENT_COLUMNS_BASE)
  }
  if (res.error) logger.error({ err: res.error }, 'payment fetch error')
  return res.data || []
}

// system actor for automatic transitions (the audit log asks "who changed
// this order" - the gateway TTL did, on a read). Best-effort by design:
// logAudit never rejects.
function auditGatewayExpiry(orderId) {
  return logAudit({
    adminEmail: 'system',
    action: 'status',
    target: `order:${orderId}`,
    details: 'payment expired automatically (gateway TTL)',
    changes: { status: { from: 'Pending', to: 'Cancelled' } },
  })
}

// Creates the hosted checkout for an unpaid online order and remembers the
// session id on the payment row. PayMongo's checkout_url is an external URL the
// browser must be redirected to (never an SPA route).
async function startGatewayCheckout({ orderId, method, amount }) {
  const session = await createCheckoutSession({
    orderId,
    amount,
    method,
    successUrl: `${siteUrl()}/orders/${orderId}?payment=paymongo`,
    cancelUrl: `${siteUrl()}/cart?payment=cancelled`,
  })
  const { error } = await supabaseAdmin
    .from('payment')
    .update({ gateway_ref: session.sessionId })
    .eq('order_id', orderId)
  if (error) logger.warn({ err: error, orderId }, 'could not store PayMongo session id')
  logger.info({ orderId, sessionId: session.sessionId }, 'PayMongo checkout session created')
  return session.checkoutUrl
}

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
// body: { items, paymentMethod, shippingFee, customerName, phone,
//         address | addressLine1, addressLine2, city, province, postalCode,
//         promo_code }
router.post('/', orderLimiter, async (req, res) => {
  const {
    items,
    paymentMethod,
    customerName,
    phone,
    address,
    addressLine1,
    addressLine2,
    city,
    province,
    postalCode,
    promo_code,
  } = req.body ?? {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' })
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' })
  }

  // cashless methods run through the (simulated) gateway: the order is created
  // Pending, money + receipt + cart-clear follow payment confirmation. COD is
  // fully synchronous, exactly as before.
  const isGateway = isGatewayMethod(paymentMethod)

  // delivery contact - validated before anything else touches the DB.
  // Phone: PH mobile only (normalized). Address: checkout sends structured
  // fields which are validated per line and joined here; older callers may
  // still send the pre-joined address string (letters + length enforced).
  const phoneCheck = normalizeMobilePhone(phone)
  if (!phoneCheck.ok) {
    return res.status(400).json({ error: phoneCheck.error })
  }

  let orderAddress = ''
  if (typeof addressLine1 === 'string' && addressLine1.trim()) {
    const built = buildOrderAddress({ addressLine1, addressLine2, city, province, postalCode })
    if (!built.ok) {
      return res.status(400).json({ error: built.error })
    }
    orderAddress = built.value || ''
  } else if (address != null && address !== '') {
    const legacy = sanitizeAddressLine(address, { maxLength: 600 })
    if (!legacy.ok) {
      return res.status(400).json({ error: legacy.error })
    }
    orderAddress = legacy.value || ''
  }

  // owner-editable shipping (site settings), falling back to the built-in
  // flat fee; the threshold waives the fee once the priced subtotal reaches it
  let { fee: shipping, freeThreshold: freeShippingThreshold } = await getShippingRules()

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

    // free-shipping threshold: waive the fee already folded into totalAmount
    // once the priced items subtotal reaches the owner's setting (null = off)
    if (freeShippingThreshold !== null && Number.isFinite(freeShippingThreshold)) {
      const itemsSubtotal = validatedItems.reduce((sum, i) => sum + i.subtotal, 0)
      if (itemsSubtotal >= freeShippingThreshold) {
        totalAmount -= shipping
        shipping = 0
      }
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

    // Idempotency: a client-supplied key makes order creation retry-safe. This
    // lookup runs BEFORE promo reservation/application so a replayed request
    // never burns a promo use or touches stock a second time.
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim()

    const findIdempotentOrder = async () => {
      const { data: existing, error: existErr } = await supabaseAdmin
        .from('orders')
        .select('order_id, status, total_amount')
        .eq('id', req.userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existErr) {
        if (isSchemaPendingError(existErr)) return null
        throw existErr
      }
      return existing || null
    }

    // Replays reflect the order that was actually stored, never the current
    // request's totals, and never re-send a receipt.
    const replayResponse = async (existing) => {
      const { data: pay } = await supabaseAdmin
        .from('payment')
        .select('method')
        .eq('order_id', existing.order_id)
        .maybeSingle()
      const gateway = Boolean(pay && isGatewayMethod(pay.method))
      if (!gateway) {
        return {
          order_id: existing.order_id,
          status: existing.status,
          total_amount: existing.total_amount,
          receipt_email_sent: false,
        }
      }

      const base = {
        order_id: existing.order_id,
        status: existing.status,
        total_amount: existing.total_amount,
      }

      if (payMongoConfigured()) {
        // only an unpaid order can be paid; a replay after payment just
        // reports the order back without minting another session
        if (existing.status !== 'Pending') return base
        try {
          return {
            ...base,
            checkout_url: await startGatewayCheckout({
              orderId: existing.order_id,
              method: pay.method,
              amount: existing.total_amount,
            }),
            payment_status: 'pending',
            gateway: 'paymongo',
          }
        } catch (payEx) {
          logger.error({ err: payEx, orderId: existing.order_id }, 'PayMongo replay failed')
          return {
            ...base,
            payment_status: 'unavailable',
            error: 'Could not restart the payment session. Please try again.',
          }
        }
      }

      return {
        ...base,
        checkout_url: `/pay/simulate?order=${existing.order_id}`,
        payment_status: 'pending',
      }
    }

    if (idempotencyKey) {
      try {
        const existing = await findIdempotentOrder()
        if (existing) return res.status(200).json(await replayResponse(existing))
      } catch (idemErr) {
        logger.warn({ err: idemErr }, 'idempotency lookup failed')
      }
    }

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
          // pick best and atomically reserve (max 2 attempts if limit raced)
          let reservedPromo = null
          for (let attempt = 0; attempt < 2; attempt++) {
            const best = pickBestPromo(activePromos, cartItemsForPromo, req.userId, usageCounts)
            if (!best || best.discountAmount <= 0) break
            const { data: reserved, error: reserveErr } = await supabaseAdmin
              .rpc('atomic_promo_increment', { p_code: best.code })
            if (reserveErr) throw reserveErr
            if (reserved && reserved.length > 0) {
              reservedPromo = best
              break
            }
            // limit reached: exclude this promo and try next best
            activePromos.splice(activePromos.findIndex(p => p.code === best.code), 1)
          }
          if (reservedPromo) {
            promoResult = reservedPromo
            promoRow = reservedPromo.promo
            totalAmount -= reservedPromo.discountAmount
          }
        }
      } catch (autoEx) {
        // auto-apply is a courtesy: a promo outage must not block checkout
        logger.warn({ err: autoEx }, 'auto-promo apply failed, charging undiscounted total')
      }
    }

    // all order writes below run as service_role: authenticated PostgREST
    // writes on orders/order_details/payment/cart_items are revoked by
    // migration 2026-10-20_revoke_client_table_writes.sql (the validated
    // API is the only way in)

    let orderId = null
    const decremented = []

    // helper to build the response for a freshly created order
    const buildOrderResponse = (oid, isGatewayOrder, receiptSent) => {
      const base = {
        order_id: oid,
        status: 'Pending',
        total_amount: totalAmount,
      }
      if (isGatewayOrder) {
        return { ...base, checkout_url: `/pay/simulate?order=${oid}`, payment_status: 'pending' }
      }
      return { ...base, receipt_email_sent: Boolean(receiptSent) }
    }

    try {
      const orderInsert = {
        id: req.userId,
        prod_id: validatedItems[0].productId,
        orderDate: new Date().toISOString(),
        status: 'Pending',
        total_amount: totalAmount,
        customer_name: customerName || '',
        phone: phoneCheck.value || '',
        address: orderAddress,
      }
      if (idempotencyKey) orderInsert.idempotency_key = idempotencyKey

      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .insert(orderInsert)
        .select('order_id')
        .single()
      // Lost a concurrent race on the same key: the winner already created the
      // order, so return that one instead of failing the checkout.
      if (orderErr && orderErr.code === '23505' && idempotencyKey) {
        const existing = await findIdempotentOrder()
        if (existing) return res.status(200).json(await replayResponse(existing))
      }
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

      let { error: detErr } = await supabaseAdmin.from('order_details').insert(detailRows)
      if (detErr && isSchemaPendingError(detErr)) {
        logger.info({ err: detErr }, 'M3 columns missing - retrying order_details insert without snapshots')
        detailRows = validatedItems.map(baseDetail)
        ;({ error: detErr } = await supabaseAdmin.from('order_details').insert(detailRows))
      }
      if (detErr) throw detErr

      // lifecycle: gateway methods start 'pending' (money arrives on the pay
      // page); COD is recorded 'succeeded' - nothing is outstanding, the cash
      // is collected on delivery
      const paymentRow = {
        order_id: orderId,
        amount: totalAmount,
        method: paymentMethod,
        status: isGateway ? 'pending' : 'succeeded',
      }
      let { error: payErr } = await supabaseAdmin.from('payment').insert(paymentRow)
      if (payErr && isSchemaPendingError(payErr)) {
        // pre-payment-status migration: shed the lifecycle columns, checkout survives
        logger.info({ err: payErr }, 'payment status columns missing - insert without them')
        ;({ error: payErr } = await supabaseAdmin.from('payment').insert({
          order_id: orderId,
          amount: totalAmount,
          method: paymentMethod,
        }))
      }
      if (payErr) throw payErr

      if (promoResult && promoRow) {
        // atomic promo usage increment with limit check via RPC
        const code = promoRow.code
        const { data: reserved, error: reserveErr } = await supabaseAdmin
          .rpc('atomic_promo_increment', { p_code: code })
        if (reserveErr) throw reserveErr
        if (!reserved || reserved.length === 0) {
          // limit reached between validation and now
          throw new Error('Promo code usage limit reached. Please try another code or remove it.')
        }

        const { error: usageErr } = await supabaseAdmin.from('promo_usage').insert({
          promo_code: code,
          user_id: req.userId,
          order_id: orderId,
          discount_applied: promoResult.discountAmount,
        })
        if (usageErr) logger.warn({ err: usageErr }, 'promo_usage insert failed')
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
        await supabaseAdmin.from('payment').delete().eq('order_id', orderId)
        await supabaseAdmin.from('order_details').delete().eq('order_id', orderId)
        await supabaseAdmin.from('orders').delete().eq('order_id', orderId)
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

    // gateway orders keep the cart until money arrives (abandon = retry with
    // the cart intact; expiry restores stock). COD clears at creation as before.
    if (!isGateway && productIds.length > 0) {
      await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('user_id', req.userId)
        .in('product_id', productIds)
    }

    // receipt email (owner-requested extension - not in the paper): COD only
    // at creation. Gateway methods send theirs when payment succeeds, so a
    // customer who abandons never gets a receipt for money they did not pay.
    // It never blocks or fails the response; without BREVO_API_KEY it is a no-op.
    let receiptSent = false
    if (!isGateway) {
      const receipt = await sendOrderReceipt(req.userEmail, {
        orderId,
        createdAt: new Date().toISOString(),
        items: validatedItems.map((i) => ({
          name: productMap.get(i.productId)?.prod_name || 'Item',
          quantity: i.quantity,
          unitPrice: i.price,
          subtotal: i.subtotal,
        })),
        discountTotal: promoResult?.discountAmount || 0,
        shippingFee: shipping,
        total: totalAmount,
        paymentMethod,
        customerName,
        address: orderAddress,
      })
      logger.info(
        { orderId, receiptSent: receipt.sent, reason: receipt.reason, to: maskEmail(req.userEmail) },
        receipt.sent ? 'Order receipt emailed' : 'Order receipt not emailed'
      )
      receiptSent = Boolean(receipt.sent)
    }

    const response = buildOrderResponse(orderId, isGateway, receiptSent)
    if (isGateway && payMongoConfigured()) {
      try {
        response.checkout_url = await startGatewayCheckout({
          orderId,
          method: paymentMethod,
          amount: totalAmount,
        })
        response.gateway = 'paymongo'
      } catch (payEx) {
        // no session = no way to pay this order; cancel it so the ledger and
        // the stock stay honest, then tell the shopper to retry
        logger.error({ err: payEx, orderId }, 'PayMongo session creation failed')
        await cancelGatewayOrder(orderId, { paymentStatus: 'failed' })
        logAudit({
          adminEmail: 'system',
          action: 'status',
          target: `order:${orderId}`,
          details: 'order cancelled: payment provider unavailable',
          changes: { status: { from: 'Pending', to: 'Cancelled' } },
        })
        return res.status(502).json({
          error: 'Our payment provider is unavailable right now. Please try again.',
          code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        })
      }
    }

    return res.status(201).json(response)
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

    const payments = await fetchPayments((cols) =>
      req.db.from('payment').select(cols).in('order_id', orderIds)
    )

    const paymentMap = new Map()
    for (const p of payments) {
      if (!paymentMap.has(p.order_id)) paymentMap.set(p.order_id, p)
    }

    // lazy gateway expiry: unpaid past the TTL -> cancelled + restocked.
    // This stack has no cron, so every read is a sweep trigger.
    const expiredIds = await sweepGatewayExpiry(orders, paymentMap)
    for (const id of expiredIds) auditGatewayExpiry(id)

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

    const paymentRows = await fetchPayments((cols) =>
      req.db.from('payment').select(cols).eq('order_id', orderId).limit(1)
    )
    const payment = paymentRows[0] || null

    // the detail page is the natural trigger when a customer revisits an
    // abandoned order (or when the pay page reloads after the window closed)
    if (payment && isGatewayOrderDue(order, payment)) {
      const ran = await expireGatewayOrder(order)
      if (ran) {
        order.status = 'Cancelled'
        payment.status = 'expired'
        auditGatewayExpiry(order.order_id)
      }
    }

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
        payment,
        feedback: feedbackRows || [],
      },
    })
  } catch (err) {
    logger.error({ err }, 'Order detail error')
    res.status(500).json({ error: 'Failed to load order' })
  }
})

// POST /api/orders/:id/payment-session — resume payment for an order that is
// still Pending (closed tab, failed attempt, back button). Returns a fresh
// hosted-checkout URL, or the simulated pay page when PayMongo is not
// configured. Ownership is enforced by the caller's RLS-scoped read.
router.post('/:id/payment-session', payLimiter, async (req, res) => {
  const orderId = String(req.params.id || '').trim()
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order id' })
  }

  try {
    const { data: order, error } = await req.db
      .from('orders')
      .select('order_id, status, created_at, total_amount')
      .eq('order_id', orderId)
      .eq('id', req.userId)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const { data: payRows, error: payErr } = await supabaseAdmin
      .from('payment')
      .select('order_id, method, status')
      .eq('order_id', orderId)
      .limit(1)
    if (payErr) throw payErr
    const payment = payRows?.[0]
    if (!payment) return res.status(404).json({ error: 'Payment record not found' })
    if (!isGatewayMethod(payment.method)) {
      return res.status(400).json({ error: 'This order does not use an online payment method' })
    }
    if (String(payment.status || '').toLowerCase() === 'succeeded' || order.status !== 'Pending') {
      return res.status(409).json({ error: 'This order is not awaiting payment.', code: 'NOT_AWAITING_PAYMENT' })
    }

    if (isGatewayOrderDue(order, payment)) {
      const ran = await expireGatewayOrder(order)
      if (ran) auditGatewayExpiry(orderId)
      return res.status(409).json({
        error: 'This order has expired. Please place a new order.',
        code: 'ORDER_EXPIRED',
      })
    }

    if (payMongoConfigured()) {
      const checkoutUrl = await startGatewayCheckout({
        orderId,
        method: payment.method,
        amount: order.total_amount,
      })
      return res.json({ checkout_url: checkoutUrl, gateway: 'paymongo' })
    }

    return res.json({ checkout_url: `/pay/simulate?order=${orderId}`, gateway: 'simulated' })
  } catch (err) {
    logger.error({ err, orderId }, 'payment session error')
    res.status(500).json({ error: 'Could not start the payment session' })
  }
})

// POST /api/orders/:id/simulate-payment — the simulated gateway's outcome
// callback (stands in for PayMongo's webhook: same transition rules, minus
// signature verification - the caller already proved order ownership, and the
// order row holds the authoritative amount).
// body: { result: 'success' | 'fail' }
router.post('/:id/simulate-payment', payLimiter, async (req, res) => {
  const orderId = String(req.params.id || '').trim()
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order id' })
  }
  const result = String(req.body?.result || '')
  if (result !== 'success' && result !== 'fail') {
    return res.status(400).json({ error: "result must be 'success' or 'fail'" })
  }

  // once real money is configured, a client-supplied "success" must never mark
  // an order paid - only the signed PayMongo webhook may
  if (payMongoConfigured()) {
    return res.status(404).json({ error: 'Not found' })
  }

  try {
    // ownership through the caller's RLS-scoped client
    const { data: order, error } = await req.db
      .from('orders')
      .select('order_id, status, created_at, total_amount')
      .eq('order_id', orderId)
      .eq('id', req.userId)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })

    // service read: the status column and the write itself bypass client RLS
    const payRes = await supabaseAdmin
      .from('payment')
      .select('order_id, method, status, amount')
      .eq('order_id', orderId)
      .limit(1)
    if (payRes.error) {
      if (isSchemaPendingError(payRes.error)) {
        return res.status(503).json({ error: 'Payment gateway is not available yet', code: 'MIGRATION_REQUIRED' })
      }
      throw payRes.error
    }
    const payment = payRes.data?.[0]
    if (!payment) return res.status(404).json({ error: 'Payment record not found' })
    if (!isGatewayMethod(payment.method)) {
      return res.status(400).json({ error: 'This order does not use an online payment method' })
    }

    // already settled (double click / refresh) - idempotent, never a second
    // receipt; product ids still come back so the client can finish clearing
    // its local cart if the first response was lost
    if (String(payment.status || '').toLowerCase() === 'succeeded') {
      const dupPayload = await loadReceiptPayload(orderId)
      return res.json({
        ok: true,
        already_paid: true,
        payment_status: 'succeeded',
        order_status: order.status,
        receipt_email_sent: false,
        product_ids: dupPayload ? dupPayload.items.map((i) => i.prod_id).filter(Boolean) : [],
      })
    }

    if (order.status === 'Cancelled') {
      return res.status(409).json({ error: 'This order was cancelled.', code: 'ORDER_CANCELLED' })
    }

    // past the abandonment window: expire now (stock comes back) and refuse
    if (isGatewayOrderDue(order, payment)) {
      const ran = await expireGatewayOrder(order)
      if (ran) auditGatewayExpiry(order.order_id)
      return res.status(409).json({
        error: 'This order has expired. Please place a new order.',
        code: 'ORDER_EXPIRED',
      })
    }

    if (result === 'fail') {
      const { error: failErr } = await supabaseAdmin
        .from('payment')
        .update({ status: 'failed' })
        .eq('order_id', orderId)
        .neq('status', 'succeeded')
      if (failErr) {
        if (isSchemaPendingError(failErr)) {
          return res.status(503).json({ error: 'Payment gateway is not available yet', code: 'MIGRATION_REQUIRED' })
        }
        throw failErr
      }
      // the order stays Pending: the customer can retry from the pay page,
      // and expiry still owns it if the window runs out
      return res.json({ ok: true, payment_status: 'failed', order_status: order.status })
    }

    // SUCCESS: the shared transition owns the claim/paid/receipt/cart sequence
    // (the PayMongo webhook calls the same function, so both paths agree).
    let settled
    try {
      settled = await settleGatewayPayment({
        order: { ...order, id: req.userId },
        payment,
        gatewayRef: `sim_${orderId.slice(0, 8)}_${Date.now().toString(36)}`,
        email: req.userEmail,
      })
    } catch (settleErr) {
      if (settleErr.code === 'ORDER_EXPIRED' || settleErr.code === 'ORDER_CANCELLED') {
        return res.status(409).json({ error: settleErr.message, code: settleErr.code })
      }
      if (settleErr.code === 'MIGRATION_REQUIRED') {
        return res.status(503).json({ error: 'Payment gateway is not available yet', code: 'MIGRATION_REQUIRED' })
      }
      throw settleErr
    }

    res.json({
      ok: true,
      payment_status: 'succeeded',
      order_status: settled.orderStatus,
      receipt_email_sent: settled.receiptEmailed,
      // returned on every success (even a duplicate) so the client can clear
      // its local cart state honestly
      product_ids: settled.productIds,
      ...(settled.alreadyPaid ? { already_paid: true } : {}),
    })
  } catch (err) {
    logger.error({ err, orderId }, 'Payment confirmation error')
    res.status(500).json({ error: 'Failed to confirm payment' })
  }
})

export default router
