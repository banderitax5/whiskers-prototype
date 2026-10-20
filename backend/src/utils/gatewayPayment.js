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
