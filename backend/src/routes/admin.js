import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'
import dns from 'dns/promises'
import { URL } from 'url'
import { supabaseAdmin, supabaseAuth } from '../config/supabase.js'
import { authMiddleware, requireAdmin, requireStaff, requireStepUp } from '../middleware/auth.js'
import { decryptText } from '../utils/encryption.js'
import { PERIODS, windowDays, bucketPayments } from '../utils/salesBuckets.js'
import { sanitizeDetails } from '../utils/productDetails.js'
import { sanitizeProductCreate, sanitizeProductPatch, parseProductListQuery, escapeLike } from '../utils/adminInput.js'
import { isUuid } from '../utils/uuid.js'
import logger from '../utils/logger.js'

const router = Router()

// the back office serves both roles: staff cover orders, products, support, payments view;
router.use(authMiddleware, requireStaff)

// automated step-up: every state-changing admin action (any non-GET request)
// requires a recent password re-verification, so new sensitive endpoints are
// covered automatically without per-route wiring
router.use((req, res, next) => (req.method === 'GET' ? next() : requireStepUp(req, res, next)))

// parses pagination params: ?page=1&pageSize=20
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize) || 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { page, pageSize, from, to }
}

// validates a :id route param is a uuid; sends 400 and returns false when not,
// so malformed ids never reach PostgREST (which answers with a 500)
function requireUuidParam(req, res) {
  if (!isUuid(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' })
    return false
  }
  return true
}

// PostgREST reports "no rows updated/selected" as PGRST116 on .single() —
// map that to a proper 404 instead of a generic 500
function isNoRowError(err) {
  return err?.code === 'PGRST116' || /no rows/i.test(err?.message || '')
}

// shape used for customer rows so the frontend gets plaintext names/phones
function formatProfile(u) {
  return {
    id: u.id,
    firstName: decryptText(u.first_name),
    lastName: decryptText(u.last_name),
    phone: decryptText(u.phone),
    role: u.role,
  }
}

// GET /api/admin/stats - top-line numbers for the dashboard
// prefers the admin_stats() aggregate (no 1000-row cap) when the M1
// migration has been applied; falls back to the legacy capped path otherwise
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { data: stats, error: rpcErr } = await supabaseAdmin.rpc('admin_stats')
    if (!rpcErr && stats && typeof stats === 'object') {
      return res.json({
        totalUsers: Number(stats.totalUsers || 0),
        totalProducts: Number(stats.totalProducts || 0),
        totalOrders: Number(stats.totalOrders || 0),
        pendingOrders: Number(stats.pendingOrders || 0),
        totalSales: Number(stats.totalSales || 0),
        totalProfit: Number(stats.totalProfit || 0),
        totalRevenue: Number(stats.totalRevenue || 0),
      })
    }
    if (rpcErr) {
      logger.warn({ err: rpcErr }, 'admin_stats() unavailable, falling back to row scans')
    }

    const [usersHead, productsHead, ordersHead, pendingHead, salesData, paymentData, ordersRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabaseAdmin.from('product').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabaseAdmin.from('sales').select('total_amount, profit'),
      supabaseAdmin.from('payment').select('amount'),
      // sales table only ever gets seeded rows, so Total Sales comes from live orders instead
      supabaseAdmin.from('orders').select('total_amount').neq('status', 'Cancelled').limit(1000),
    ])

    const totalSales = (ordersRes.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
    const totalProfit = (salesData.data || []).reduce((s, r) => s + Number(r.profit || 0), 0)
    const totalRevenue = (paymentData.data || []).reduce((s, r) => s + Number(r.amount || 0), 0)

    res.json({
      totalUsers: usersHead.count ?? 0,
      totalProducts: productsHead.count ?? 0,
      totalOrders: ordersHead.count ?? 0,
      pendingOrders: pendingHead.count ?? 0,
      totalSales,
      totalProfit,
      totalRevenue,
    })
  } catch (err) {
    logger.error({ err }, 'Admin stats error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/analytics - event data for charts
router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30))
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('event_type, page, metadata, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) throw error

    // traffic by source (utm_source)
    const sourceCounts = {}
    for (const e of events || []) {
      const src = e.metadata?.utm_source || 'direct'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    }

    // campaign performance (utm_campaign)
    const campaignCounts = {}
    for (const e of events || []) {
      const camp = e.metadata?.utm_campaign || null
      if (camp) campaignCounts[camp] = (campaignCounts[camp] || 0) + 1
    }

    // conversion funnel
    const funnel = { page_view: 0, product_view: 0, add_to_cart: 0, checkout_complete: 0 }
    for (const e of events || []) {
      if (funnel[e.event_type] !== undefined) funnel[e.event_type]++
    }

    // daily page views
    const dailyViews = {}
    for (const e of events || []) {
      if (e.event_type === 'page_view') {
        const day = e.created_at.slice(0, 10)
        dailyViews[day] = (dailyViews[day] || 0) + 1
      }
    }

    // top searched queries
    const searchCounts = {}
    for (const e of events || []) {
      if (e.event_type === 'search' && e.metadata?.query) {
        const q = e.metadata.query.toLowerCase()
        searchCounts[q] = (searchCounts[q] || 0) + 1
      }
    }
    const topSearches = Object.entries(searchCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }))

    res.json({
      totalEvents: (events || []).length,
      sources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      campaigns: Object.entries(campaignCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      funnel,
      dailyViews: Object.entries(dailyViews).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
      topSearches,
    })
  } catch (err) {
    logger.error({ err }, 'Admin analytics error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/sales-analytics - sales data for charts
router.get('/sales-analytics', requireAdmin, async (req, res) => {
  try {
    const period = PERIODS.includes(req.query.period) ? req.query.period : 'daily'
    const days = windowDays(period, parseInt(req.query.days))
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const [ordersRes, paymentsRes] = await Promise.all([
      supabaseAdmin.from('orders')
        .select('order_id, total_amount, status, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('payment')
        .select('order_id, amount, method, payment_date')
        .gte('payment_date', since),
    ])

    const orders = ordersRes.data || []
    const payments = paymentsRes.data || []

    // daily revenue (kept for older clients) and the requested period buckets
    const dailyRevenue = bucketPayments(payments, 'daily')
    const periodRevenue = bucketPayments(payments, period)

    // revenue by payment method
    const methodRevenue = {}
    for (const p of payments) {
      const m = p.method || 'unknown'
      methodRevenue[m] = (methodRevenue[m] || 0) + Number(p.amount || 0)
    }

    // top selling products by quantity in this window — prefers the
    // admin_top_products() aggregate (M1 migration); the fallback filters
    // order_details to this window's order_ids instead of the whole table
    let topProducts = null
    const { data: topRows, error: topErr } = await supabaseAdmin
      .rpc('admin_top_products', { since, lim: 10 })
    if (!topErr && Array.isArray(topRows) && topRows.length > 0) {
      const ids = topRows.map(r => r.prod_id).filter(Boolean)
      const prodMap = {}
      if (ids.length > 0) {
        const { data: prods } = await supabaseAdmin.from('product').select('prod_id, prod_name').in('prod_id', ids)
        for (const p of prods || []) prodMap[p.prod_id] = p.prod_name
      }
      topProducts = topRows.map(r => ({
        name: prodMap[r.prod_id] || `Product #${r.prod_id}`,
        quantity: Number(r.quantity || 0),
        revenue: Math.round(Number(r.revenue || 0) * 100) / 100,
      }))
    } else {
      if (topErr) {
        logger.warn({ err: topErr }, 'admin_top_products() unavailable, falling back to order_details scan')
      }
      const windowOrderIds = orders.map(o => o.order_id)
      const detailsRes = windowOrderIds.length > 0
        ? await supabaseAdmin.from('order_details')
            .select('prod_id, quantity, subtotal')
            .in('order_id', windowOrderIds)
        : { data: [] }
      const details = detailsRes.data || []
      const prodQty = {}
      const prodRevenue = {}
      for (const d of details) {
        if (!d.prod_id) continue
        prodQty[d.prod_id] = (prodQty[d.prod_id] || 0) + Number(d.quantity || 0)
        prodRevenue[d.prod_id] = (prodRevenue[d.prod_id] || 0) + Number(d.subtotal || 0)
      }
      const topProdIds = Object.entries(prodQty).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id)
      let prodMap = {}
      if (topProdIds.length > 0) {
        const { data: prods } = await supabaseAdmin.from('product').select('prod_id, prod_name').in('prod_id', topProdIds)
        prodMap = Object.fromEntries((prods || []).map(p => [p.prod_id, p.prod_name]))
      }
      topProducts = topProdIds.map(id => ({
        name: prodMap[id] || `Product #${id}`,
        quantity: prodQty[id],
        revenue: Math.round((prodRevenue[id] || 0) * 100) / 100,
      }))
    }

    // order status breakdown
    const statusCounts = {}
    for (const o of orders) {
      const s = o.status || 'unknown'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }

    res.json({
      totalRevenue: payments.reduce((s, p) => s + Number(p.amount || 0), 0),
      totalOrders: orders.length,
      period,
      periodRevenue,
      dailyRevenue,
      methodRevenue: Object.entries(methodRevenue)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })),
      topProducts,
      statusCounts: Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({ status, count })),
    })
  } catch (err) {
    logger.error({ err }, 'Sales analytics error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/customers - paginated user list with feedback and order stats
router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req.query)

    const { data, error, count } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone, role, feedback(comments)', { count: 'exact' })
      .order('first_name', { ascending: true })
      .range(from, to)
    if (error) throw error

    // order stats per customer — prefers the admin_order_stats() aggregate
    // (M1 migration); falls back to the 1000-row-batch walk otherwise
    const statsByUser = new Map()
    const { data: statRows, error: statErr } = await supabaseAdmin.rpc('admin_order_stats')
    if (!statErr && Array.isArray(statRows)) {
      for (const row of statRows) {
        statsByUser.set(row.user_id, { count: Number(row.orders_count || 0), spent: Number(row.total_spent || 0) })
      }
    } else {
      if (statErr) {
        logger.warn({ err: statErr }, 'admin_order_stats() unavailable, falling back to batch scan')
      }
      for (let offset = 0; offset < 10000; offset += 1000) {
        const { data: batch } = await supabaseAdmin
          .from('orders')
          .select('id, total_amount, status')
          .range(offset, offset + 999)
        for (const o of batch || []) {
          if (!o.id || o.status === 'Cancelled') continue
          const agg = statsByUser.get(o.id) || { count: 0, spent: 0 }
          agg.count += 1
          agg.spent += Number(o.total_amount || 0)
          statsByUser.set(o.id, agg)
        }
        if (!batch || batch.length < 1000) break
      }
    }

    const customers = (data || []).map((u) => {
      const agg = statsByUser.get(u.id)
      return {
        ...formatProfile(u),
        feedback: u.feedback?.[0]?.comments || null,
        ordersCount: agg?.count || 0,
        totalSpent: Math.round((agg?.spent || 0) * 100) / 100,
      }
    })
    res.json({ items: customers, page, pageSize, total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Admin customers error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/customers/:id/role
// body: { role } — must be 'user', 'staff', or 'admin'
// step-up (password re-verification) is enforced router-wide for all writes
// prevents admin from demoting themselves
router.patch('/customers/:id/role', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const { role } = req.body ?? {}
  const ALLOWED_ROLES = ['user', 'staff', 'admin']

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })
  }

  // prevent admin from demoting themselves
  if (req.params.id === req.userId && role !== 'admin') {
    return res.status(400).json({ error: 'Cannot change your own admin role' })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', req.params.id)
      .select('id, role')
      .single()
    if (error) {
      if (isNoRowError(error)) {
        return res.status(404).json({ error: 'User not found' })
      }
      throw error
    }
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'role_change', target: `user:${req.params.id}`, details: `role -> ${role} (step-up verified)` })
  } catch (err) {
    logger.error({ err }, 'Admin role update error')
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/customers/:id
// removes the account (auth user + profile); step-up enforced router-wide
// prevents admin from deleting themselves
router.delete('/customers/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' })
  }

  try {
    const { error } = await supabaseAuth.auth.admin.deleteUser(req.params.id)
    if (error) {
      if (String(error.message).toLowerCase().includes('not found')) {
        return res.status(404).json({ error: 'User not found' })
      }
      throw error
    }
    // profile rows usually cascade from auth.users; remove any leftover row
    await supabaseAdmin.from('profiles').delete().eq('id', req.params.id)
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'user_delete', target: `user:${req.params.id}`, details: 'account removed (step-up verified)' })
  } catch (err) {
    logger.error({ err }, 'Admin customer delete error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/products - paginated product list
// query: ?q=name-search &category=Dogs &brand=Aozi &active=true|false
//        &sort=newest|name_asc|name_desc|price_asc|price_desc|stock_asc|stock_desc
router.get('/products', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req.query)
    const { q, category, brand, active, sort } = parseProductListQuery(req.query)

    let query = supabaseAdmin
      .from('product')
      .select('*', { count: 'exact' })
      .order(sort.column, { ascending: sort.ascending })
      .range(from, to)
    if (q) {
      query = query.or(`prod_name.ilike.%${escapeLike(q)}%,brand.ilike.%${escapeLike(q)}%`)
    }
    if (category) query = query.ilike('category', `%${escapeLike(category)}%`)
    if (brand) query = query.eq('brand', brand)
    if (active !== null) query = query.eq('is_active', active)

    const { data, error, count } = await query
    if (error) throw error
    res.json({ items: data || [], page, pageSize, total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Admin products list error')
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/admin/products
router.post('/products', async (req, res) => {
  const { error: inputErr, value } = sanitizeProductCreate(req.body ?? {})
  if (inputErr) return res.status(400).json({ error: inputErr })
  const sanitizedDetails = sanitizeDetails(req.body?.details)
  if (sanitizedDetails.error) return res.status(400).json({ error: sanitizedDetails.error })
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .insert({ ...value, details: sanitizedDetails.value })
      .select()
      .single()
    if (error) throw error
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'create', target: `product:${data.prod_id}`, details: value.prod_name })
  } catch (err) {
    logger.error({ err }, 'Admin product create error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const { error: inputErr, updates } = sanitizeProductPatch(req.body ?? {})
  if (inputErr) return res.status(400).json({ error: inputErr })
  if ('details' in updates) {
    const sanitizedDetails = sanitizeDetails(updates.details)
    if (sanitizedDetails.error) return res.status(400).json({ error: sanitizedDetails.error })
    // an empty list clears the product information back to null
    updates.details = sanitizedDetails.value
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .update(updates)
      .eq('prod_id', req.params.id)
      .select()
      .single()
    if (error) {
      if (isNoRowError(error)) {
        return res.status(404).json({ error: 'Product not found' })
      }
      throw error
    }
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'update', target: `product:${req.params.id}`, details: Object.keys(updates).join(', ') })
  } catch (err) {
    logger.error({ err }, 'Admin product update error')
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/products/:id
// removes the DB row first (it is the source of truth); the storage object is
// best-effort cleanup afterwards so a storage hiccup cannot orphan a delete
router.delete('/products/:id', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: deleted, error: delErr } = await supabaseAdmin
      .from('product')
      .delete()
      .eq('prod_id', req.params.id)
      .select('image_url')
    if (delErr) throw delErr
    if (!deleted || deleted.length === 0) {
      return res.status(404).json({ error: 'Product not found' })
    }

    const filename = extractStorageFilename(deleted[0].image_url)
    if (filename) {
      await supabaseAdmin.storage.from('product-images').remove([filename]).catch(() => {})
    }

    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'delete', target: `product:${req.params.id}` })
  } catch (err) {
    logger.error({ err }, 'Admin product delete error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/payments - paginated payments with buyer name and order status
router.get('/payments', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req.query)

    const { data: payments, error: payErr, count } = await supabaseAdmin
      .from('payment')
      .select('payment_id, amount, method, payment_date, order_id', { count: 'exact' })
      .order('payment_date', { ascending: false })
      .range(from, to)
    if (payErr) throw payErr

    if (!payments || payments.length === 0) {
      return res.json({ items: [], page, pageSize, total: count ?? 0 })
    }

    // batch-fetch only the orders and profiles we need for this page
    const orderIds = payments.map(p => p.order_id)
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('order_id, id, status')
      .in('order_id', orderIds)

    const userIds = [...new Set((orders || []).map(o => o.id))]
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', userIds)

    const orderMap = new Map((orders || []).map(o => [o.order_id, o]))
    const profileMap = new Map((profiles || []).map(p => [p.id, p]))

    const items = payments.map((p) => {
      const order = orderMap.get(p.order_id)
      const profile = order ? profileMap.get(order.id) : null
      return {
        payment_id: p.payment_id,
        order_id: p.order_id,
        amount: p.amount,
        method: p.method,
        status: order?.status || 'Unknown',
        payment_date: p.payment_date,
        firstName: decryptText(profile?.first_name),
        lastName: decryptText(profile?.last_name),
      }
    })
    res.json({ items, page, pageSize, total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Admin payments error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/orders - paginated order list with buyer and line items
// query: ?status=Pending|Shipped|... to filter
const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
router.get('/orders', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req.query)

    if (req.query.status && !ORDER_STATUSES.includes(String(req.query.status))) {
      return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` })
    }

    let query = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (req.query.status) {
      query = query.eq('status', String(req.query.status))
    }

    const { data: orders, error, count } = await query
    if (error) throw error

    if (!orders || orders.length === 0) {
      return res.json({ items: [], page, pageSize, total: count ?? 0 })
    }

    // batch-fetch only the related data for this page
    const userIds = [...new Set(orders.map(o => o.id))]
    const orderIds = orders.map(o => o.order_id)

    const [profilesRes, detailsRes, paymentsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', userIds),
      supabaseAdmin.from('order_details').select('order_id, prod_id, quantity, subtotal').in('order_id', orderIds),
      supabaseAdmin.from('payment').select('order_id, amount, method, payment_date').in('order_id', orderIds),
    ])

    const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]))

    const prodIds = [...new Set((detailsRes.data || []).map(d => d.prod_id).filter(Boolean))]
    const productsRes = prodIds.length > 0
      ? await supabaseAdmin.from('product').select('prod_id, prod_name').in('prod_id', prodIds)
      : { data: [] }
    const prodMap = new Map((productsRes.data || []).map(p => [p.prod_id, p.prod_name]))

    const detailsMap = new Map()
    for (const d of (detailsRes.data || [])) {
      if (!detailsMap.has(d.order_id)) detailsMap.set(d.order_id, [])
      detailsMap.get(d.order_id).push(d)
    }

    const paymentMap = new Map()
    for (const p of (paymentsRes.data || [])) {
      if (!paymentMap.has(p.order_id)) paymentMap.set(p.order_id, p)
    }

    const items = orders.map((o) => {
      const profile = profileMap.get(o.id)
      const orderItems = detailsMap.get(o.order_id) || []
      return {
        order_id: o.order_id,
        user_id: o.id,
        status: o.status,
        total_amount: o.total_amount,
        created_at: o.created_at,
        customer_name: o.customer_name || '',
        phone: o.phone || '',
        address: o.address || '',
        firstName: decryptText(profile?.first_name),
        lastName: decryptText(profile?.last_name),
        items: orderItems.map(d => ({
          name: prodMap.get(d.prod_id) || 'Unknown',
          quantity: d.quantity,
          subtotal: d.subtotal,
        })),
        payment: paymentMap.get(o.order_id) || null,
      }
    })
    res.json({ items, page, pageSize, total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Admin orders list error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/orders/:id
// body: { status }
// updates the order's lifecycle status (Pending -> Shipped -> Delivered etc)
router.patch('/orders/:id', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const { status } = req.body ?? {}
  if (!status || typeof status !== 'string') {
    return res.status(400).json({ error: 'status is required' })
  }
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` })
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('order_id', req.params.id)
      .select('order_id, status, created_at')
      .single()
    if (error) {
      if (isNoRowError(error)) {
        return res.status(404).json({ error: 'Order not found' })
      }
      throw error
    }
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'status', target: `order:${req.params.id}`, details: `status -> ${status}` })
  } catch (err) {
    logger.error({ err }, 'Admin order update error')
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/orders/:id
// cascades: deletes order_details + payment rows first, then the order
router.delete('/orders/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const orderId = req.params.id
  try {
    // delete payment
    await supabaseAdmin.from('payment').delete().eq('order_id', orderId)
    // delete order_details
    await supabaseAdmin.from('order_details').delete().eq('order_id', orderId)
    // delete the order itself
    const { data: deleted, error } = await supabaseAdmin.from('orders').delete().eq('order_id', orderId).select('order_id')
    if (error) throw error
    if (!deleted || deleted.length === 0) {
      return res.status(404).json({ error: 'Order not found' })
    }
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'delete', target: `order:${orderId}` })
  } catch (err) {
    logger.error({ err }, 'Admin order delete error')
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/payments/:id
router.delete('/payments/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: deleted, error } = await supabaseAdmin
      .from('payment')
      .delete()
      .eq('payment_id', req.params.id)
      .select('payment_id')
    if (error) throw error
    if (!deleted || deleted.length === 0) {
      return res.status(404).json({ error: 'Payment not found' })
    }
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'delete', target: `payment:${req.params.id}` })
  } catch (err) {
    logger.error({ err }, 'Admin payment delete error')
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Customer Support ──────────────────────────────────────────────────────────

// GET /api/admin/supports - all support cases with the sender's name
router.get('/supports', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req.query)

    const { data, error, count } = await supabaseAdmin
      .from('supports')
      .select('*', { count: 'exact' })
      .order('date_submitted', { ascending: false })
      .range(from, to)
    if (error) throw error

    const userIds = [...new Set((data || []).map((s) => s.id).filter(Boolean))]
    const { data: profiles } = userIds.length > 0
      ? await supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', userIds)
      : { data: [] }
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

    const items = (data || []).map((s) => {
      const profile = profileMap.get(s.id)
      return {
        support_id: s.support_id,
        message: s.message,
        response: s.response,
        date_submitted: s.date_submitted,
        firstName: decryptText(profile?.first_name),
        lastName: decryptText(profile?.last_name),
      }
    })
    res.json({ items, page, pageSize, total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Admin supports list error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/supports/:id
// body: { response } — replies to a support case
router.patch('/supports/:id', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const response = String(req.body?.response ?? '').trim()
  if (!response || response.length > 2000) {
    return res.status(400).json({ error: 'response must be between 1 and 2000 characters' })
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('supports')
      .update({ response })
      .eq('support_id', req.params.id)
      .select('support_id')
      .single()
    if (error) {
      if (isNoRowError(error)) {
        return res.status(404).json({ error: 'Support case not found' })
      }
      throw error
    }
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'status', target: `support:${req.params.id}`, details: 'support reply sent' })
  } catch (err) {
    logger.error({ err }, 'Admin support reply error')
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Audit Logs ────────────────────────────────────────────────────────────────

// GET /api/admin/audit-logs
// query: ?limit=100 (default 100, max 500)
router.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Admin audit logs error')
    res.status(500).json({ error: 'Server error' })
  }
})

// helper: insert an audit log record (called after admin actions)
export async function logAudit({ adminEmail, action, target, details }) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      admin_email: adminEmail || 'unknown',
      action,
      target: target || null,
      details: details || null,
    })
  } catch (err) {
    logger.error({ err }, 'Audit log write failed')
  }
}

// ── Image Upload / Delete ──────────────────────────────────────────────────────

const TEMP_DIR = path.join(os.tmpdir(), 'petconnect-uploads')
fs.mkdirSync(TEMP_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    fieldNestingDepth: 10,
    fieldArrayIndexLimit: 1000,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    cb(null, allowed.includes(file.mimetype))
  },
})

const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

// blocks loopback, private, link-local, CGNAT, multicast and IPv6 ULA ranges
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && (b === 168 || b === 0)) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a >= 224) return true
    return false
  }
  if (net.isIPv6(ip)) {
    const h = ip.toLowerCase()
    if (h === '::' || h === '::1') return true
    if (h.startsWith('fc') || h.startsWith('fd')) return true
    if (/^fe[89ab]/.test(h)) return true
    if (h.startsWith('::ffff:')) return isPrivateIp(h.slice(7))
    return false
  }
  return true
}

// blocks SSRF by rejecting URLs that point to private/internal networks —
// checks the literal hostname AND whatever the domain resolves to, since a
// public-looking domain can still point at 169.254.169.254
async function isSafeUrl(urlStr) {
  let parsed
  try {
    parsed = new URL(urlStr)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false
  if (hostname === 'metadata.google.internal') return false

  let addresses
  if (net.isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = (await dns.lookup(hostname, { all: true })).map((a) => a.address)
    } catch {
      return false
    }
  }
  return addresses.length > 0 && addresses.every((addr) => !isPrivateIp(addr))
}

// maps multer errors (oversized file, too many fields) to clean 4xx responses
// instead of letting express's default handler turn them into 500s
function runUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Image exceeds the 5MB limit' })
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Upload rejected: ' + err.message })
    }
    logger.error({ err }, 'Unexpected upload middleware error')
    return res.status(400).json({ error: 'Upload rejected' })
  })
}

// POST /api/admin/images/upload
// Accepts multipart file (field: "image") OR JSON { imageUrl }
router.post('/images/upload', runUpload, async (req, res) => {
  let tempPath = req.file?.path
  try {
    let fileBuffer

    if (req.file) {
      fileBuffer = await sharp(req.file.path)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    } else if (req.body?.imageUrl) {
      if (!(await isSafeUrl(req.body.imageUrl))) {
        return res.status(400).json({ error: 'URL is not allowed (private/internal addresses are blocked)' })
      }
      // manual so a redirect can never bounce us onto an internal address
      const resp = await fetch(req.body.imageUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      if (resp.status >= 300 && resp.status < 400) {
        return res.status(400).json({ error: 'Redirects are not allowed' })
      }
      if (!resp.ok) return res.status(400).json({ error: 'Failed to fetch image from URL' })

      const remoteType = resp.headers.get('content-type') || ''
      if (!remoteType.startsWith('image/')) return res.status(400).json({ error: 'URL does not point to an image' })

      const declared = Number(resp.headers.get('content-length') || 0)
      if (declared > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image exceeds the 5MB limit' })
      const arrayBuf = await resp.arrayBuffer()
      if (arrayBuf.byteLength > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image exceeds the 5MB limit' })
      }
      fileBuffer = await sharp(Buffer.from(arrayBuf))
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    } else {
      return res.status(400).json({ error: 'Provide an image file or imageUrl' })
    }

    const ext = 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Ensure bucket exists (create if missing)
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    const bucketExists = (buckets || []).some(b => b.name === 'product-images')
    if (!bucketExists) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket('product-images', {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
      })
      if (createErr) {
        logger.error({ err: createErr }, 'Bucket create error')
        return res.status(500).json({ error: 'Failed to create storage bucket' })
      }
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('product-images')
      .upload(fileName, fileBuffer, { contentType: 'image/jpeg' })
    if (uploadError) {
      logger.error({ err: uploadError }, 'Storage upload error')
      return res.status(500).json({ error: 'Storage upload failed' })
    }

    const { data } = supabaseAdmin.storage.from('product-images').getPublicUrl(fileName)
    res.status(201).json({ url: data.publicUrl })
    logAudit({ adminEmail: req.userEmail, action: 'image_upload', target: fileName, details: req.file ? 'multipart upload' : `from URL: ${String(req.body?.imageUrl).slice(0, 200)}` })
  } catch (err) {
    logger.error({ err }, 'Image upload error')
    res.status(500).json({ error: 'Failed to upload image' })
  } finally {
    if (tempPath) {
      fs.unlink(tempPath, () => {})
    }
  }
})

// DELETE /api/admin/images/:filename
router.delete('/images/:filename', async (req, res) => {
  // storage object names are generated by us (timestamp-random.jpg) — anything
  // else (slashes, dots, path traversal) is rejected before touching storage
  const filename = String(req.params.filename || '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z]{1,5}$/.test(filename) || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid file name' })
  }
  try {
    const { error } = await supabaseAdmin.storage
      .from('product-images')
      .remove([filename])
    if (error) throw error
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'image_delete', target: filename })
  } catch (err) {
    logger.error({ err }, 'Image delete error')
    res.status(500).json({ error: 'Failed to delete image' })
  }
})

// ── Product Delete (with image cleanup) ────────────────────────────────────────

function extractStorageFilename(url) {
  if (!url) return null
  // URLs look like: https://xxx.supabase.co/storage/v1/object/public/product-images/filename.ext
  const match = url.match(/product-images\/([^?]+)/)
  return match ? match[1] : null
}

export default router
