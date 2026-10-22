// Payment provider callbacks.
//
// PayMongo delivers `checkout_session.payment.paid` to this route after the
// shopper pays on the hosted page. This is the ONLY path allowed to mark a
// gateway order paid when PAYMONGO_SECRET_KEY is configured (the simulated
// callback is closed in that case).
//
// Contract:
//   - the raw request body is required for signature verification, so this
//     router is mounted BEFORE express.json() in index.js;
//   - a bad/absent signature is 401 and the body is never parsed;
//   - every event we cannot act on still returns 200 so PayMongo does not
//     retry it 12 times (retries are for transient failures only);
//   - amount mismatch is not fulfilled and is audit-logged for a human;
//   - delivery is at-least-once: the shared settle step is idempotent.

import express, { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import {
  payMongoConfigured,
  payMongoWebhookSecret,
  payMongoLiveMode,
  verifyWebhookSignature,
  toCentavos,
} from '../utils/payMongo.js'
import { isGatewayMethod, settleGatewayPayment } from '../utils/gatewayPayment.js'
import { clientIp } from '../middleware/rateLimiter.js'
import { logAudit } from './admin.js'
import logger from '../utils/logger.js'

const router = Router()

router.post(
  '/paymongo/webhook',
  express.raw({ type: '*/*', limit: '256kb' }),
  async (req, res) => {
    if (!payMongoConfigured() || !payMongoWebhookSecret()) {
      logger.warn('PayMongo webhook received but PayMongo is not configured')
      return res.status(503).json({ error: 'PayMongo is not configured' })
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''))
    const valid = verifyWebhookSignature({
      header: req.get('paymongo-signature'),
      rawBody: raw,
      secret: payMongoWebhookSecret(),
      livemode: payMongoLiveMode(),
    })
    if (!valid) {
      logger.warn({ ip: clientIp(req) }, 'PayMongo webhook rejected: invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    let event
    try {
      event = JSON.parse(raw.toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' })
    }

    const type = event?.data?.attributes?.type
    if (type !== 'checkout_session.payment.paid') {
      return res.status(200).json({ received: true, ignored: type || 'unknown event' })
    }

    const session = event?.data?.attributes?.data
    const sessionAttrs = session?.attributes || {}
    const orderId = String(sessionAttrs.metadata?.order_id || sessionAttrs.reference_number || '').trim()
    if (!orderId) {
      logger.error({ sessionId: session?.id }, 'PayMongo webhook has no order reference')
      return res.status(200).json({ received: true, ignored: 'no order reference' })
    }

    try {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('order_id, id, status, total_amount')
        .eq('order_id', orderId)
        .maybeSingle()
      if (orderErr) throw orderErr
      if (!order) {
        logger.error({ orderId, sessionId: session?.id }, 'PayMongo webhook for unknown order')
        return res.status(200).json({ received: true, ignored: 'unknown order' })
      }

      const { data: payRows, error: payErr } = await supabaseAdmin
        .from('payment')
        .select('order_id, method, status, amount')
        .eq('order_id', orderId)
        .limit(1)
      if (payErr) throw payErr
      const payment = payRows?.[0]
      if (!payment) {
        logger.error({ orderId }, 'PayMongo webhook: order has no payment row')
        return res.status(200).json({ received: true, ignored: 'no payment row' })
      }
      if (!isGatewayMethod(payment.method)) {
        logger.error({ orderId, method: payment.method }, 'PayMongo webhook: order is not a gateway payment')
        return res.status(200).json({ received: true, ignored: 'not a gateway order' })
      }

      // defence in depth: fulfil only the amount the ledger expects
      const paidCentavos = Number(sessionAttrs.payments?.[0]?.attributes?.amount)
      const expectedCentavos = toCentavos(order.total_amount)
      if (Number.isFinite(paidCentavos) && expectedCentavos !== null && paidCentavos !== expectedCentavos) {
        logger.error(
          { orderId, paidCentavos, expectedCentavos, sessionId: session?.id },
          'PayMongo amount mismatch - order not fulfilled'
        )
        await logAudit({
          adminEmail: 'system',
          action: 'status',
          target: `order:${orderId}`,
          details: `PayMongo payment amount mismatch (paid ${paidCentavos}, expected ${expectedCentavos} centavos) - not fulfilled, review manually`,
        })
        return res.status(200).json({ received: true, ignored: 'amount mismatch' })
      }

      let email = null
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(order.id)
        email = userData?.user?.email || null
      } catch (mailLookupErr) {
        logger.warn({ err: mailLookupErr, orderId }, 'webhook: customer email lookup failed')
      }

      const settled = await settleGatewayPayment({
        order,
        payment,
        gatewayRef: session?.id || null,
        email,
        realMoney: true,
      })

      if (!settled.alreadyPaid) {
        await logAudit({
          adminEmail: 'system',
          action: 'status',
          target: `order:${orderId}`,
          details: settled.paidAfterCancel
            ? 'PayMongo payment received AFTER the order expired - refund required'
            : 'PayMongo payment confirmed',
          changes: {
            status: { from: order.status, to: settled.orderStatus },
            payment: { from: payment.status || 'pending', to: 'succeeded' },
          },
        })
      }

      return res.status(200).json({
        received: true,
        ...(settled.paidAfterCancel ? { paid_after_cancel: true } : {}),
      })
    } catch (err) {
      // transient (DB/network): let PayMongo retry the delivery
      logger.error({ err, orderId }, 'PayMongo webhook processing failed')
      return res.status(500).json({ error: 'Webhook processing failed' })
    }
  }
)

export default router
