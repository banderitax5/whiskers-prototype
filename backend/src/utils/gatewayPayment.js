// Simulated payment gateway state machine - the seam the real PayMongo
// integration will replace (same entry points: confirm / fail / expire).
//
// Contracts every caller can rely on:
//   - an online order is "paid" only through an explicit success confirmation;
//     the simulation trusts its authenticated endpoint, PayMongo will verify
//     webhook signature + amount at this seam instead;
//   - expiry and success race on the same status-guarded order update, so
//     exactly one of them owns the transition (no double state);
//   - stock and promo reservations come back on expiry, best-effort but
//     logged, only after the order is already Cancelled.
//
// Deliberately route-free: orders.js and admin.js import this module, so it
// must never import either (audit logging happens at the call sites).

import { supabaseAdmin } from '../config/supabase.js'
import { isSchemaPendingError } from './pgErrors.js'
import { sendOrderReceipt, maskEmail } from './mailer.js'
import logger from './logger.js'

export const GATEWAY_METHOD_IDS = ['gcash', 'paymaya']

export function isGatewayMethod(method) {
  return GATEWAY_METHOD_IDS.includes(String(method || '').trim().toLowerCase())
}

// owner-configurable abandonment window (minutes). Default 30; the owner sets
// GATEWAY_TTL_MINUTES=1 for walkthrough demos.
export function gatewayTtlMinutes() {
  const raw = Number(process.env.GATEWAY_TTL_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : 30
}

// an unpaid gateway order past its TTL is due for cancellation. A payment row
// without a status column (pre-migration) counts as unpaid, so the sweep still
// works before the migration lands.
export function isGatewayOrderDue(order, payment, now = Date.now()) {
  if (!order || order.status !== 'Pending') return false
  if (!payment || !isGatewayMethod(payment.method)) return false
  if (String(payment.status || '').toLowerCase() === 'succeeded') return false
  const created = Date.parse(order.created_at || '')
  if (!Number.isFinite(created)) return false
  return now - created > gatewayTtlMinutes() * 60 * 1000
}

// full expiry transition for one order. Returns { transitioned: true } when
// this call cancelled it, else null (not due / already settled / lost the race).
export async function expireGatewayOrder(order) {
  try {
    // fresh payment read: the caller's copy may be stale, and the status
    // column may not exist yet (shed to base columns then)
    let payRes = await supabaseAdmin
      .from('payment')
      .select('order_id, method, status')
      .eq('order_id', order.order_id)
      .limit(1)
    if (payRes.error && isSchemaPendingError(payRes.error)) {
      payRes = await supabaseAdmin
        .from('payment')
        .select('order_id, method')
        .eq('order_id', order.order_id)
        .limit(1)
    }
    if (payRes.error) throw payRes.error
    const payment = payRes.data?.[0]
    if (!isGatewayOrderDue(order, payment)) return null

    // claim the order transition first - a success confirmation racing here
    // hits the same row with an equivalent guard, so exactly one wins
    const { data: cancelled, error: cancelErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'Cancelled' })
      .eq('order_id', order.order_id)
      .eq('status', 'Pending')
      .select('order_id')
    if (cancelErr) throw cancelErr
    if (!cancelled || cancelled.length === 0) return null

    // mark the payment (best-effort: pre-migration the column is absent and
    // the Cancelled order above is already the source of truth)
    const { error: markErr } = await supabaseAdmin
      .from('payment')
      .update({ status: 'expired' })
      .eq('order_id', order.order_id)
      .neq('status', 'succeeded')
    if (markErr && !isSchemaPendingError(markErr)) {
      logger.warn({ err: markErr, orderId: order.order_id }, 'payment expiry mark failed')
    }

    await restoreStock(order.order_id)
    await releasePromo(order.order_id)
    logger.info({ orderId: order.order_id, ttlMinutes: gatewayTtlMinutes() }, 'gateway order expired (cancelled + restocked)')
    return { transitioned: true }
  } catch (err) {
    logger.error({ err, orderId: order.order_id }, 'gateway expiry failed')
    return null
  }
}

// lazy expiry sweep for a page of already-fetched orders: this stack has no
// cron, so reads are the trigger. Mutates `status` on rows that transitioned
// so responses never show a stale Pending, and returns the expired order ids
// for the caller's audit log.
export async function sweepGatewayExpiry(orders, paymentByOrderId) {
  const expired = []
  for (const order of orders || []) {
    if (order.status !== 'Pending') continue
    const payment = paymentByOrderId.get(order.order_id)
    if (!isGatewayOrderDue(order, payment)) continue
    const result = await expireGatewayOrder(order)
    if (result) {
      order.status = 'Cancelled'
      if (payment) payment.status = 'expired'
      expired.push(order.order_id)
    }
  }
  return expired
}

/**
 * Shared success transition for every confirmation path (the simulated
 * callback and the PayMongo webhook). Callers pass the rows they already read
 * and verified, so ownership / signature checks stay at the route.
 *
 * Exactly-once rules:
 *   - the order claim (Pending|Processing -> Processing) and expiry race on the
 *     same status-guarded update, so one of them owns the transition;
 *   - the payment update is guarded with neq(status,'succeeded'), and only the
 *     call that actually flipped the row sends the receipt + clears the cart.
 *
 * `realMoney` marks a gateway-confirmed payment (webhook): if the order was
 * cancelled in the meantime the money is real, so the payment is recorded as
 * succeeded and the caller is told (paidAfterCancel) instead of the update
 * being silently dropped. Nothing is restocked - an operator must refund.
 *
 * Throws { code: 'ORDER_EXPIRED' } when a same-time expiry won the race.
 */
export async function settleGatewayPayment({
  order,
  payment,
  gatewayRef = null,
  email = null,
  realMoney = false,
}) {
  const orderId = order.order_id

  if (String(payment?.status || '').toLowerCase() === 'succeeded') {
    const dupPayload = await loadReceiptPayload(orderId)
    return {
      alreadyPaid: true,
      paidAfterCancel: false,
      orderStatus: order.status,
      receiptEmailed: false,
      productIds: dupPayload ? dupPayload.items.map((i) => i.prod_id).filter(Boolean) : [],
    }
  }

  const markPaid = async (ref) => {
    const { data: marked, error } = await supabaseAdmin
      .from('payment')
      .update({
        status: 'succeeded',
        paid_at: new Date().toISOString(),
        ...(ref ? { gateway_ref: ref } : {}),
      })
      .eq('order_id', orderId)
      .neq('status', 'succeeded')
      .select('payment_id')
    if (error) {
      if (isSchemaPendingError(error)) {
        const missing = new Error('Payment gateway is not available yet')
        missing.code = 'MIGRATION_REQUIRED'
        throw missing
      }
      throw error
    }
    return (marked || []).length > 0
  }

  if (order.status === 'Cancelled') {
    if (!realMoney) {
      const cancelled = new Error('This order was cancelled.')
      cancelled.code = 'ORDER_CANCELLED'
      throw cancelled
    }
    const recorded = await markPaid(gatewayRef)
    logger.error(
      { orderId, gatewayRef },
      'payment confirmed after cancellation - recorded, refund required'
    )
    return {
      alreadyPaid: !recorded,
      paidAfterCancel: true,
      orderStatus: 'Cancelled',
      receiptEmailed: false,
      productIds: [],
    }
  }

  // staff may have advanced an unpaid order already; Shipped/Delivered accept
  // late payment without a status flip, Cancelled never does
  let orderStatusNow = order.status
  if (order.status === 'Pending' || order.status === 'Processing') {
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'Processing' })
      .eq('order_id', orderId)
      .in('status', ['Pending', 'Processing'])
      .select('status')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) {
      const { data: fresh } = await supabaseAdmin
        .from('orders')
        .select('status')
        .eq('order_id', orderId)
        .maybeSingle()
      if (fresh?.status === 'Cancelled') {
        if (realMoney) {
          const recorded = await markPaid(gatewayRef)
          logger.error(
            { orderId, gatewayRef },
            'payment confirmed after cancellation - recorded, refund required'
          )
          return {
            alreadyPaid: !recorded,
            paidAfterCancel: true,
            orderStatus: 'Cancelled',
            receiptEmailed: false,
            productIds: [],
          }
        }
        const expired = new Error('This order has expired. Please place a new order.')
        expired.code = 'ORDER_EXPIRED'
        throw expired
      }
      orderStatusNow = fresh?.status || order.status
    } else {
      orderStatusNow = claimed[0].status
    }
  }

  // independent: claiming the payment writes status/paid_at, while the receipt
  // payload only reads order lines, totals and the method/amount columns
  const [firstClaim, payload] = await Promise.all([
    markPaid(gatewayRef),
    loadReceiptPayload(orderId),
  ])
  const productIds = payload ? payload.items.map((i) => i.prod_id).filter(Boolean) : []

  let receiptEmailed = false
  if (firstClaim && payload && email) {
    // never throws; without BREVO_API_KEY it is a no-op
    const receipt = await sendOrderReceipt(email, payload)
    receiptEmailed = Boolean(receipt.sent)
    logger.info(
      { orderId, receiptSent: receipt.sent, reason: receipt.reason, to: maskEmail(email) },
      receipt.sent ? 'Payment receipt emailed' : 'Payment receipt not emailed'
    )
    // the cart checkout kept until money arrived - cleared server-side once
    if (order.id && productIds.length > 0) {
      await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('user_id', order.id)
        .in('product_id', productIds)
    }
  }

  return {
    alreadyPaid: !firstClaim,
    paidAfterCancel: false,
    orderStatus: orderStatusNow,
    receiptEmailed,
    productIds,
  }
}

/**
 * Force-cancel an unpaid gateway order (PayMongo session could not be created,
 * so the shopper has no way to pay). Same transition as expiry minus the TTL
 * precondition, and the guarded update means a concurrent success still wins.
 */
export async function cancelGatewayOrder(orderId, { paymentStatus = 'failed' } = {}) {
  try {
    const { data: cancelled, error } = await supabaseAdmin
      .from('orders')
      .update({ status: 'Cancelled' })
      .eq('order_id', orderId)
      .eq('status', 'Pending')
      .select('order_id')
    if (error) throw error
    if (!cancelled || cancelled.length === 0) return false

    const { error: markErr } = await supabaseAdmin
      .from('payment')
      .update({ status: paymentStatus })
      .eq('order_id', orderId)
      .neq('status', 'succeeded')
    if (markErr && !isSchemaPendingError(markErr)) {
      logger.warn({ err: markErr, orderId }, 'payment cancel mark failed')
    }

    await restoreStock(orderId)
    await releasePromo(orderId)
    logger.info({ orderId }, 'gateway order cancelled (unpayable)')
    return true
  } catch (err) {
    logger.error({ err, orderId }, 'gateway order cancel failed')
    return false
  }
}

// rebuilds the receipt payload at payment-success time (gateway orders skip
// the receipt at creation - a customer who abandons never paid). Returns null
// when the order or its lines cannot be read.
export async function loadReceiptPayload(orderId) {
  try {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('order_id, created_at, total_amount, customer_name, address')
      .eq('order_id', orderId)
      .maybeSingle()
    if (error) throw error
    if (!order) return null

    const { data: details, error: detErr } = await supabaseAdmin
      .from('order_details')
      .select('prod_id, quantity, subtotal, discount_amount')
      .eq('order_id', orderId)
    if (detErr) throw detErr
    if (!details || details.length === 0) return null

    const prodIds = [...new Set(details.map((d) => d.prod_id).filter(Boolean))]
    const { data: products } = await supabaseAdmin
      .from('product')
      .select('prod_id, prod_name')
      .in('prod_id', prodIds)
    const prodMap = new Map((products || []).map((p) => [p.prod_id, p.prod_name]))

    const { data: payRows } = await supabaseAdmin
      .from('payment')
      .select('method, amount')
      .eq('order_id', orderId)
      .limit(1)
    const payment = payRows?.[0]

    const itemsSubtotal = details.reduce((sum, d) => sum + Number(d.subtotal || 0), 0)
    const discountTotal = details.reduce(
      (sum, d) => sum + Number(d.discount_amount || 0) * Number(d.quantity || 0),
      0
    )
    const total = Number(order.total_amount || 0)

    return {
      orderId: order.order_id,
      createdAt: order.created_at,
      items: details.map((d) => ({
        prod_id: d.prod_id,
        name: prodMap.get(d.prod_id) || 'Item',
        quantity: Number(d.quantity) || 1,
        unitPrice: Number(d.subtotal || 0) / Math.max(1, Number(d.quantity) || 1),
        subtotal: Number(d.subtotal || 0),
      })),
      discountTotal,
      // total = itemsSubtotal - discountTotal + shipping (creation formula)
      shippingFee: Math.max(0, total - itemsSubtotal + discountTotal),
      total,
      paymentMethod: payment?.method || '',
      customerName: order.customer_name || '',
      address: order.address || '',
    }
  } catch (err) {
    logger.error({ err, orderId }, 'payment receipt payload load failed')
    return null
  }
}

// puts held quantities back on the shelf (mirrors the create-path rollback)
async function restoreStock(orderId) {
  try {
    const { data: details, error } = await supabaseAdmin
      .from('order_details')
      .select('prod_id, quantity')
      .eq('order_id', orderId)
    if (error) throw error
    for (const d of details || []) {
      try {
        const { data: cur } = await supabaseAdmin
          .from('product')
          .select('stock_quantity')
          .eq('prod_id', d.prod_id)
          .single()
        if (!cur) continue
        const { error: updErr } = await supabaseAdmin
          .from('product')
          .update({ stock_quantity: Number(cur.stock_quantity || 0) + Number(d.quantity || 0) })
          .eq('prod_id', d.prod_id)
        if (updErr) throw updErr
      } catch (ex) {
        logger.error({ err: ex, orderId, prodId: d.prod_id }, 'expiry stock restore failed')
      }
    }
  } catch (ex) {
    logger.error({ err: ex, orderId }, 'expiry stock restore could not read details')
  }
}

// undoes the promo reservation so usage counts stay honest
async function releasePromo(orderId) {
  try {
    const { data: usage } = await supabaseAdmin
      .from('promo_usage')
      .select('promo_code')
      .eq('order_id', orderId)
      .limit(1)
    const code = usage?.[0]?.promo_code
    if (!code) return
    await supabaseAdmin.from('promo_usage').delete().eq('order_id', orderId)
    const { data: promo } = await supabaseAdmin
      .from('promos')
      .select('usage_count')
      .eq('code', code)
      .maybeSingle()
    if (promo) {
      await supabaseAdmin
        .from('promos')
        .update({ usage_count: Math.max(0, Number(promo.usage_count || 0) - 1) })
        .eq('code', code)
    }
    logger.info({ orderId, code }, 'expiry promo reservation released')
  } catch (ex) {
    logger.warn({ err: ex, orderId }, 'expiry promo release failed')
  }
}
