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
import { toCsv } from '../utils/csv.js'
import { invalidateContentCache } from './siteContent.js'
import { isUuid } from '../utils/uuid.js'
import { sanitizeAltText, mediaPageParams, buildUsageIndex } from '../utils/mediaRules.js'
import { sanitizeBanner, PLACEMENTS } from '../utils/bannerRules.js'
import { sanitizeSection } from '../utils/sectionRules.js'
import { sanitizeNavItem, sanitizeCategoryBatch, sanitizeCategoryRemoval, NAV_SECTIONS } from '../utils/navRules.js'
import { sanitizeSettings, sanitizeFaq, sanitizePolicy, mergeSettings } from '../utils/siteSettingsRules.js'
import { invalidateSettingsCache } from '../utils/shopSettings.js'
import { missingColumnOf, isSchemaPendingError } from '../utils/pgErrors.js'
import { effectiveUnitPrice, lineMargin } from '../utils/orderCosting.js'
import { sendOrderStatusEmail, sendSupportReplyEmail, maskEmail } from '../utils/mailer.js'
import { recordContentHistory, diffChanges, historyLabel } from '../utils/contentHistory.js'
import { defaultRowsFor, RESTORE_SCOPES } from '../utils/siteContentDefaults.js'
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

// costing fields are admin-only: staff manage products but must never see
// cost/margin. Applied to every product response before it leaves the API.
function stripCostFields(row) {
  if (!row) return row
  const { cost_price, supplier, ...rest } = row
  return rest
}

// best-effort selling-price trail: a failed history insert is logged but never
// fails the price change itself (the price is the source of truth; history is
// an audit aid). old_price null = first recorded price (product create).
async function recordPriceHistory(prodId, oldPrice, newPrice, changedBy) {
  try {
    const { error } = await supabaseAdmin.from('product_price_history').insert({
      prod_id: prodId,
      old_price: oldPrice,
      new_price: newPrice,
      changed_by: changedBy || null,
    })
    if (error) throw error
  } catch (err) {
    logger.error({ err, prodId }, 'price history insert failed')
  }
}

// the auth account's email for a user id (GoTrue admin). Returns null on any
// failure - customer mail is best-effort, so no lookup, no email.
async function authUserEmail(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabaseAuth.auth.admin.getUserById(userId)
    if (error) return null
    return data?.user?.email || null
  } catch {
    return null
  }
}

// Sends a customer notification (order status, support reply). Every failure
// path means "no email", never a failed business action - the caller has
// already responded. `what` only labels the log line.
async function notifyCustomer(userId, send, what) {
  try {
    const to = await authUserEmail(userId)
    if (!to) return
    const res = await send(to)
    logger.info(
      { to: maskEmail(to), sent: res.sent, reason: res.reason },
      res.sent ? `${what} emailed` : `${what} not emailed`
    )
  } catch (err) {
    logger.warn({ err }, `failed to notify customer about ${what}`)
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
//        &archived=false|true|all  (default false = hide archived)
//        &sort=newest|name_asc|name_desc|price_asc|price_desc|stock_asc|stock_desc
// costing columns (cost_price/supplier) are stripped for non-admin callers.
router.get('/products', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req.query)
    const { q, category, brand, active, archived, sort } = parseProductListQuery(req.query)
    const isAdmin = req.userRole === 'admin'

    // explicit columns: never select image_data (bytea); cost/supplier/
    // archived_at shed automatically on a database that has not run M2 yet
    let columns = [
      'prod_id', 'created_at', 'prod_name', 'category', 'price', 'stock_quantity',
      'brand', 'image_url', 'is_active', 'description', 'details',
      'archived_at', 'cost_price', 'supplier',
    ]
    const M2_COLUMNS = ['archived_at', 'cost_price', 'supplier']
    let archivedFilter = archived // 'true' | 'false' | 'all'

    const build = () => {
      let query = supabaseAdmin
        .from('product')
        .select(columns.join(', '), { count: 'exact' })
        .order(sort.column, { ascending: sort.ascending })
        .range(from, to)
      if (q) {
        query = query.or(`prod_name.ilike.%${escapeLike(q)}%,brand.ilike.%${escapeLike(q)}%`)
      }
      if (category) query = query.ilike('category', `%${escapeLike(category)}%`)
      if (brand) query = query.eq('brand', brand)
      if (active !== null) query = query.eq('is_active', active)
      if (archivedFilter === 'true') query = query.not('archived_at', 'is', null)
      else if (archivedFilter === 'false') query = query.is('archived_at', null)
      return query
    }

    let result = null
    for (;;) {
      const { data, error, count } = await build()
      if (!error) { result = { data, count }; break }
      // M2 columns missing: drop them from the select and retry. The default
      // archived filter degrades to "all" (nothing can be archived before M2
      // anyway); asking for archived rows explicitly gets a clear 503 instead.
      const missing = missingColumnOf(error, M2_COLUMNS)
      if (!missing) throw error
      const colsBefore = columns.length
      const filterBefore = archivedFilter
      if (missing === 'archived_at') {
        if (archivedFilter === 'true') {
          return res.status(503).json({ error: 'Archiving requires a pending database migration (M2).', code: 'MIGRATION_REQUIRED' })
        }
        archivedFilter = 'all'
      }
      columns = columns.filter((c) => c !== missing)
      // no progress means the error names something else entirely: rethrow
      // instead of spinning (the helper falls back to the first candidate)
      if (columns.length === colsBefore && archivedFilter === filterBefore) throw error
    }

    const items = (result?.data || []).map((row) => (isAdmin ? row : stripCostFields(row)))
    res.json({ items, page, pageSize, total: result?.count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Admin products list error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/products/export - CSV backup of the whole catalog. staff get
// the same columns as their list view (no cost/supplier); admin gets costing
// too. descriptions and details JSON are escaped so a spreadsheet round-trips.
router.get('/products/export', async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin'
    const rows = []
    for (let from = 0; from < 100000; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from('product')
        .select('prod_id, prod_name, category, brand, price, stock_quantity, is_active, image_url, description, details, archived_at, cost_price, supplier')
        .order('prod_name', { ascending: true })
        .range(from, from + 999)
      if (error) {
        // costing columns missing (pre-M2): retry without them
        if (missingColumnOf(error, ['cost_price', 'supplier'])) {
          const retry = await supabaseAdmin
            .from('product')
            .select('prod_id, prod_name, category, brand, price, stock_quantity, is_active, image_url, description, details, archived_at')
            .order('prod_name', { ascending: true })
            .range(from, from + 999)
          if (retry.error) throw retry.error
          rows.push(...(retry.data || []))
          if (!retry.data || retry.data.length < 1000) break
          continue
        }
        throw error
      }
      rows.push(...(data || []))
      if (!data || data.length < 1000) break
    }

    const headers = ['prod_id', 'prod_name', 'category', 'brand', 'price', 'stock_quantity', 'is_active', 'image_url', 'description', 'details']
    if (isAdmin) headers.push('cost_price', 'supplier')
    const csvRows = rows.map((r) => {
      const base = [
        r.prod_id, r.prod_name, r.category, r.brand, r.price, r.stock_quantity,
        r.is_active === false ? 'false' : 'true', r.image_url, r.description,
        Array.isArray(r.details) && r.details.length ? JSON.stringify(r.details) : '',
      ]
      if (isAdmin) base.push(r.cost_price ?? '', r.supplier ?? '')
      return base
    })
    const stamp = new Date().toISOString().slice(0, 10)
    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="whiskers-products-${stamp}.csv"`)
    res.send(toCsv(headers, csvRows))
  } catch (err) {
    logger.error({ err }, 'Admin product export error')
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/admin/products/import - apply a validated batch of rows from a
// spreadsheet. The client parses/validates for the preview and size-aware
// batches (~60KB) to stay under the global 100kb json limit; the server
// re-validates every row through the same sanitizers as the single-row routes.
// A row with prod_id updates that product; without it, a new product is made.
// Cap of 200 rows per request keeps one batch well inside the body limit.
router.post('/products/import', requireAdmin, async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null
  if (!rows) return res.status(400).json({ error: 'rows must be an array' })
  if (rows.length === 0 || rows.length > 200) {
    return res.status(400).json({ error: 'Import accepts between 1 and 200 rows per batch' })
  }
  try {
    // one pass over the table: id -> row (for updates) and the name set
    // (for uniqueness, including archived rows)
    const byId = new Map()
    const nameOwner = new Map() // lowercase name -> prod_id
    for (let from = 0; from < 100000; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from('product')
        .select('prod_id, prod_name, price')
        .range(from, from + 999)
      if (error) throw error
      for (const r of data || []) {
        byId.set(r.prod_id, r)
        nameOwner.set(String(r.prod_name || '').trim().toLowerCase(), r.prod_id)
      }
      if (!data || data.length < 1000) break
    }

    const isAdmin = req.userRole === 'admin'
    const errors = []
    let created = 0
    let updated = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {}
      try {
        let details = row.details
        if (typeof details === 'string' && details.trim()) {
          try { details = JSON.parse(details) } catch { throw new Error('details must be valid JSON') }
        }
        // costing fields are admin-only; strip for staff before sanitizing
        const body = { ...row, details }
        if (!isAdmin) { delete body.cost_price; delete body.supplier }
        delete body.prod_id

        const prodId = typeof row.prod_id === 'string' ? row.prod_id.trim() : ''
        if (prodId) {
          if (!byId.has(prodId)) throw new Error('No product with that ID')
          const { error: inputErr, updates } = sanitizeProductPatch(body)
          if (inputErr) throw new Error(inputErr)
          if ('details' in updates) {
            const d = sanitizeDetails(updates.details)
            if (d.error) throw new Error(d.error)
            updates.details = d.value
          }
          if (Object.keys(updates).length === 0) continue
          const prev = byId.get(prodId)
          const newName = updates.prod_name
          if (newName && String(prev.prod_name || '').trim().toLowerCase() !== newName.toLowerCase()) {
            const owner = nameOwner.get(newName.trim().toLowerCase())
            if (owner && owner !== prodId) throw new Error(`Name already used by another product`)
            nameOwner.set(newName.trim().toLowerCase(), prodId)
          }
          const { error: updErr } = await supabaseAdmin.from('product').update(updates).eq('prod_id', prodId)
          if (updErr) {
            if (isSchemaPendingError(updErr)) throw new Error('Database migration pending (M2)')
            throw new Error(updErr.message || 'Update failed')
          }
          if ('price' in updates && Number(prev.price) !== updates.price) {
            await recordPriceHistory(prodId, prev.price, updates.price, req.userEmail)
          }
          updated++
        } else {
          const { error: inputErr, value } = sanitizeProductCreate(body)
          if (inputErr) throw new Error(inputErr)
          const nameKey = value.prod_name.trim().toLowerCase()
          if (nameOwner.has(nameKey)) throw new Error('A product with that name already exists')
          const { data: inserted, error: insErr } = await supabaseAdmin.from('product').insert({ ...value, details: sanitizeDetails(details).value ?? null }).select('prod_id').single()
          if (insErr) {
            if (isSchemaPendingError(insErr)) throw new Error('Database migration pending (M2)')
            throw new Error(insErr.message || 'Insert failed')
          }
          // same first-listed-price trail the single-product POST records
          await recordPriceHistory(inserted.prod_id, null, value.price, req.userEmail)
          nameOwner.set(nameKey, inserted.prod_id)
          created++
        }
      } catch (err) {
        errors.push({ row: i + 1, message: err.message || 'Invalid row' })
      }
    }

    res.json({ created, updated, errors })
    logAudit({ adminEmail: req.userEmail, action: 'import', target: 'products', details: `created=${created} updated=${updated} errors=${errors.length}` })
  } catch (err) {
    logger.error({ err }, 'Admin product import error')
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/admin/products - creating products is an admin action (matrix:
// staff edit text/images/price/stock, only admin adds or removes products)

// app-level name uniqueness (case-insensitive). No DB unique constraint exists
// (adding one would be a migration), so this check has a tiny race window -
// acceptable for a single-owner shop; a unique index is the future fix.
async function productNameTaken(name, excludeId = null) {
  const { data } = await supabaseAdmin
    .from('product')
    .select('prod_id, prod_name')
    .ilike('prod_name', escapeLike(name))
    .limit(50)
  const lower = String(name).trim().toLowerCase()
  return (data || []).some((r) => String(r.prod_name || '').trim().toLowerCase() === lower && r.prod_id !== excludeId)
}

router.post('/products', requireAdmin, async (req, res) => {
  const { error: inputErr, value } = sanitizeProductCreate(req.body ?? {})
  if (inputErr) return res.status(400).json({ error: inputErr })
  const sanitizedDetails = sanitizeDetails(req.body?.details)
  if (sanitizedDetails.error) return res.status(400).json({ error: sanitizedDetails.error })
  try {
    if (await productNameTaken(value.prod_name)) {
      return res.status(409).json({ error: 'A product with that name already exists', code: 'NAME_TAKEN' })
    }
    const { data, error } = await supabaseAdmin
      .from('product')
      .insert({ ...value, details: sanitizedDetails.value })
      .select()
      .single()
    if (error) {
      if (isSchemaPendingError(error)) {
        return res.status(503).json({ error: 'Cost/supplier fields require a pending database migration (M2).', code: 'MIGRATION_REQUIRED' })
      }
      throw error
    }
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'create', target: `product:${data.prod_id}`, details: value.prod_name })
    // M2 may not be applied yet; recordPriceHistory logs and moves on
    recordPriceHistory(data.prod_id, null, value.price, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Admin product create error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/products/:id
// cost_price/supplier/archived are admin-only: staff edit text/images/price/
// stock but must never see or set costing data, nor change product lifecycle.
router.patch('/products/:id', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const body = req.body ?? {}
  const touchesCosting = 'cost_price' in body || 'supplier' in body
  const touchesArchive = 'archived' in body
  const touchesPrice = 'price' in body
  if (req.userRole !== 'admin') {
    // selling price is owner territory: staff manage text/images/stock but a
    // price change attempt is refused outright (fail-closed, like costing)
    if (touchesPrice) {
      return res.status(403).json({ error: 'Only an admin can change the selling price' })
    }
    if (touchesCosting || touchesArchive) {
      return res.status(403).json({ error: 'Admin access required' })
    }
  }
  const { archived, ...rest } = body
  const { error: inputErr, updates } = Object.keys(rest).length > 0
    ? sanitizeProductPatch(rest)
    : { error: null, updates: {} }
  if (inputErr) return res.status(400).json({ error: inputErr })
  if ('details' in updates) {
    const sanitizedDetails = sanitizeDetails(updates.details)
    if (sanitizedDetails.error) return res.status(400).json({ error: sanitizedDetails.error })
    // an empty list clears the product information back to null
    updates.details = sanitizedDetails.value
  }
  if (touchesArchive) {
    if (typeof archived !== 'boolean') return res.status(400).json({ error: 'archived must be true or false' })
    updates.archived_at = archived ? new Date().toISOString() : null
    // archiving also hides the product from the public store; restoring keeps
    // it hidden until an admin explicitly sets it Active again (no accidental
    // public re-publish)
    if (archived) updates.is_active = false
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' })
  }

  try {
    // price/name change? read the current row first so history records
    // old -> new prices and the name-uniqueness check can skip self-matches
    let oldPrice = null
    if ('price' in updates || 'prod_name' in updates) {
      const { data: prev } = await supabaseAdmin
        .from('product')
        .select('price, prod_name')
        .eq('prod_id', req.params.id)
        .maybeSingle()
      oldPrice = 'price' in updates ? (prev?.price ?? null) : null
      if ('prod_name' in updates
        && String(prev?.prod_name || '').trim().toLowerCase() !== updates.prod_name.toLowerCase()
        && await productNameTaken(updates.prod_name, req.params.id)) {
        return res.status(409).json({ error: 'A product with that name already exists', code: 'NAME_TAKEN' })
      }
    }

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
      if (isSchemaPendingError(error)) {
        return res.status(503).json({ error: 'Cost/supplier/archived fields require a pending database migration (M2).', code: 'MIGRATION_REQUIRED' })
      }
      throw error
    }
    const isAdmin = req.userRole === 'admin'
    res.json({ item: isAdmin ? data : stripCostFields(data) })
    logAudit({ adminEmail: req.userEmail, action: 'update', target: `product:${req.params.id}`, details: Object.keys(updates).join(', ') })
    if ('price' in updates && Number(oldPrice) !== updates.price) {
      recordPriceHistory(req.params.id, oldPrice, updates.price, req.userEmail)
    }
  } catch (err) {
    logger.error({ err }, 'Admin product update error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/products/:id/price-history - selling-price trail, newest
// first. staff can read it (it only contains prices, which staff see anyway);
// never contains cost.
router.get('/products/:id/price-history', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data, error } = await supabaseAdmin
      .from('product_price_history')
      .select('old_price, new_price, changed_by, created_at')
      .eq('prod_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      if (isSchemaPendingError(error)) {
        return res.status(503).json({ error: 'Price history requires a pending database migration (M2).', code: 'MIGRATION_REQUIRED' })
      }
      throw error
    }
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Product price history error')
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/products/:id - admin-only lifecycle action.
// removes the DB row first (it is the source of truth); the storage object is
// best-effort cleanup afterwards so a storage hiccup cannot orphan a delete.
// products with order history are protected by a NO ACTION foreign key: offer
// a friendly 409 pointing at archive instead of a raw FK error.
router.delete('/products/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { count: linked, error: linkErr } = await supabaseAdmin
      .from('order_details')
      .select('prod_id', { count: 'exact', head: true })
      .eq('prod_id', req.params.id)
    if (linkErr) throw linkErr
    if (linked > 0) {
      return res.status(409).json({
        error: 'This product appears in past orders and cannot be deleted. Archive it instead - order history keeps working.',
        code: 'HAS_ORDER_HISTORY',
      })
    }

    const { data: deleted, error: delErr } = await supabaseAdmin
      .from('product')
      .delete()
      .eq('prod_id', req.params.id)
      .select('image_url')
    if (delErr) {
      // race backstop: an order slipped in between the check and the delete
      if (delErr.code === '23503') {
        return res.status(409).json({
          error: 'This product appears in past orders and cannot be deleted. Archive it instead - order history keeps working.',
          code: 'HAS_ORDER_HISTORY',
        })
      }
      throw delErr
    }
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

    // M3 cost snapshots: prefer the snapshot columns, fall back to the base
    // shape on a database that has not run M3 yet (margin fields simply
    // disappear from the payload instead of failing the whole list).
    const DETAIL_COLUMNS_BASE = 'order_id, prod_id, quantity, subtotal'
    const DETAIL_COLUMNS_COSTED = `${DETAIL_COLUMNS_BASE}, unit_price, unit_cost, discount_amount`
    let hasSnapshots = true
    let detailsRes = await supabaseAdmin.from('order_details').select(DETAIL_COLUMNS_COSTED).in('order_id', orderIds)
    if (detailsRes.error && isSchemaPendingError(detailsRes.error)) {
      logger.info({ err: detailsRes.error }, 'M3 columns missing - admin orders without cost fields')
      hasSnapshots = false
      detailsRes = await supabaseAdmin.from('order_details').select(DETAIL_COLUMNS_BASE).in('order_id', orderIds)
    }
    if (detailsRes.error) throw detailsRes.error

    const [profilesRes, paymentsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', userIds),
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

    const isAdminCaller = req.userRole === 'admin'
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
          ...(hasSnapshots ? {
            unit_price: d.unit_price,
            discount_amount: d.discount_amount,
            // canonical per-unit price (matches SQL effective_price())
            effective_unit_price: effectiveUnitPrice(d),
            // costing is admin-only: staff see selling prices only
            ...(isAdminCaller ? {
              unit_cost: d.unit_cost,
              line_margin: lineMargin(d),
            } : {}),
          } : {}),
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
// and emails the customer when the status actually changes
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
    // read the row first: the notification needs the buyer's user id and the
    // previous status, and we only email when something actually changed
    const { data: current, error: readErr } = await supabaseAdmin
      .from('orders')
      .select('order_id, id, status')
      .eq('order_id', req.params.id)
      .maybeSingle()
    if (readErr) throw readErr
    if (!current) {
      return res.status(404).json({ error: 'Order not found' })
    }

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

    if (current.status !== status) {
      const { count } = await supabaseAdmin
        .from('order_details')
        .select('order_id', { count: 'exact', head: true })
        .eq('order_id', req.params.id)
      await notifyCustomer(
        current.id,
        (to) => sendOrderStatusEmail(to, {
          orderId: req.params.id,
          status,
          previousStatus: current.status,
          itemsCount: count ?? 0,
        }),
        'order status update'
      )
    }
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
// body: { response } — replies to a support case and emails the customer
router.patch('/supports/:id', async (req, res) => {
  if (!requireUuidParam(req, res)) return
  const response = String(req.body?.response ?? '').trim()
  if (!response || response.length > 2000) {
    return res.status(400).json({ error: 'response must be between 1 and 2000 characters' })
  }
  try {
    // read the row first: the reply email must quote the customer's original
    // message and needs the owner (support id) to look up the recipient
    const { data: current, error: readErr } = await supabaseAdmin
      .from('supports')
      .select('support_id, id, message')
      .eq('support_id', req.params.id)
      .maybeSingle()
    if (readErr) throw readErr
    if (!current) {
      return res.status(404).json({ error: 'Support case not found' })
    }

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

    // first name for the greeting; profiles store it encrypted, and a lookup
    // failure just falls back to a neutral greeting
    let firstName = null
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('first_name')
        .eq('id', current.id)
        .maybeSingle()
      if (profile?.first_name) firstName = decryptText(profile.first_name)
    } catch { /* no name is fine */ }

    await notifyCustomer(
      current.id,
      (to) => sendSupportReplyEmail(to, {
        customerName: firstName,
        message: current.message,
        reply: response,
      }),
      'support reply'
    )
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

// ── Media Library (admin only) ───────────────────────────────────────────────

// every image the content screens can reference. Uploading goes through the
// same hardened pipeline as product images (type/size limits, sharp re-encode,
// storage bucket); the extra column set records alt text (required), the
// storage path and the last broken-image check so the storefront and the
// admin can agree on what is broken.

const MEDIA_COLUMNS = 'id, url, storage_path, alt_text, mime_type, size_bytes, width, height, is_broken, last_broken_at, created_by, created_at, archived_at'

// small tables (5 banners, ~17 nav rows, a handful of sections): fetch them
// whole and answer "where is this image used" in memory
async function fetchUsageRefs() {
  const [banners, nav, sections] = await Promise.all([
    supabaseAdmin.from('site_banners').select('id, placement, desktop_image_url, mobile_image_url').is('archived_at', null),
    supabaseAdmin.from('site_nav_items').select('id, section, image_url').is('archived_at', null),
    supabaseAdmin.from('site_home_sections').select('id, type, title, config').is('archived_at', null),
  ])
  return {
    banners: banners.data || [],
    nav: nav.data || [],
    sections: (sections.data || []).map((s) => ({ ...s, configText: JSON.stringify(s.config ?? {}) })),
  }
}

// re-encode like the product image pipeline; returns the buffer plus the
// metadata the media library shows (dimensions, final size)
async function processMedia(buffer) {
  const image = sharp(buffer)
  const meta = await image.metadata()
  const out = await image
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return { buffer: out, width: meta.width ?? null, height: meta.height ?? null }
}

// GET /api/admin/media?page&pageSize&q&archived=true
router.get('/media', requireAdmin, async (req, res) => {
  try {
    const { page, pageSize } = mediaPageParams(req.query)
    const showArchived = String(req.query.archived) === 'true'
    let query = supabaseAdmin.from('site_media').select(MEDIA_COLUMNS, { count: 'exact' })
    if (showArchived) query = query.not('archived_at', 'is', null)
    else query = query.is('archived_at', null)
    const q = String(req.query.q || '').trim()
    if (q) query = query.ilike('alt_text', `%${escapeLike(q)}%`)
    const from = (page - 1) * pageSize
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }

    const refs = await fetchUsageRefs()
    const usage = buildUsageIndex((data || []).map((m) => m.url), refs)
    const items = (data || []).map((m) => ({ ...m, used_in: usage.get(m.url) || [] }))
    res.json({ items, total: count ?? 0, page, pageSize })
  } catch (err) {
    logger.error({ err }, 'Media list error')
    res.status(500).json({ error: 'Failed to load media' })
  }
})

// POST /api/admin/media — multipart "image" or JSON { imageUrl }, alt required.
// Alt text is checked BEFORE the upload so a missing alt never leaves an
// orphan file in the bucket.
router.post('/media', requireAdmin, runUpload, async (req, res) => {
  let tempPath = req.file?.path
  try {
    const alt = sanitizeAltText(req.body?.altText)
    if (!alt.ok) return res.status(400).json({ error: alt.error })

    let source
    if (req.file) {
      source = { buffer: await fs.promises.readFile(req.file.path), mimeType: req.file.mimetype }
    } else if (req.body?.imageUrl) {
      if (!(await isSafeUrl(req.body.imageUrl))) {
        return res.status(400).json({ error: 'URL is not allowed (private/internal addresses are blocked)' })
      }
      const resp = await fetch(req.body.imageUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      if (resp.status >= 300 && resp.status < 400) {
        return res.status(400).json({ error: 'Redirects are not allowed' })
      }
      if (!resp.ok) return res.status(400).json({ error: 'Failed to fetch image from URL' })
      const remoteType = resp.headers.get('content-type') || ''
      if (!remoteType.startsWith('image/')) return res.status(400).json({ error: 'URL does not point to an image' })
      const arrayBuf = await resp.arrayBuffer()
      if (arrayBuf.byteLength > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image exceeds the 5MB limit' })
      source = { buffer: Buffer.from(arrayBuf), mimeType: remoteType }
    } else {
      return res.status(400).json({ error: 'Provide an image file or imageUrl' })
    }

    const { buffer, width, height } = await processMedia(source.buffer)
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('product-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg' })
    if (uploadError) {
      logger.error({ err: uploadError }, 'Media upload error')
      return res.status(500).json({ error: 'Storage upload failed' })
    }
    const { data: publicData } = supabaseAdmin.storage.from('product-images').getPublicUrl(fileName)

    const row = {
      url: publicData.publicUrl,
      storage_path: fileName,
      alt_text: alt.value,
      mime_type: 'image/jpeg',
      size_bytes: buffer.length,
      width,
      height,
      created_by: req.userEmail,
    }
    const { data, error } = await supabaseAdmin.from('site_media').insert(row).select(MEDIA_COLUMNS).single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'media_upload', target: fileName, details: `alt: ${alt.value}` })
    recordContentHistory('media', data.id, 'create', data, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Media upload error')
    res.status(500).json({ error: 'Failed to upload media' })
  } finally {
    if (tempPath) fs.unlink(tempPath, () => {})
  }
})

// PATCH /api/admin/media/:id — edit alt text (the only owner-editable field;
// swapping the file is an upload + archive flow so history stays honest)
router.patch('/media/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const alt = sanitizeAltText(req.body?.altText)
    if (!alt.ok) return res.status(400).json({ error: alt.error })
    const { data: before } = await supabaseAdmin.from('site_media').select(MEDIA_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Media not found' })
    const { data, error } = await supabaseAdmin
      .from('site_media')
      .update({ alt_text: alt.value, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(MEDIA_COLUMNS)
      .single()
    if (error) throw error
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'media_update', target: req.params.id, details: `alt: '${before.alt_text}' -> '${alt.value}'` })
    recordContentHistory('media', req.params.id, 'update', { name: historyLabel(before, 'alt_text', 'url') || 'Image', changes: diffChanges(before, data, ['alt_text']) }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Media update error')
    res.status(500).json({ error: 'Failed to update media' })
  }
})

// DELETE /api/admin/media/:id — soft delete (archive) with undo. Refuses while
// the image is still referenced, because that would break a live page.
router.delete('/media/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: media } = await supabaseAdmin.from('site_media').select(MEDIA_COLUMNS).eq('id', req.params.id).single()
    if (!media) return res.status(404).json({ error: 'Media not found' })
    const refs = await fetchUsageRefs()
    const usedIn = buildUsageIndex([media.url], refs).get(media.url) || []
    if (usedIn.length > 0 && String(req.query.force) !== 'true') {
      return res.status(409).json({
        error: 'This image is still in use',
        used_in: usedIn,
      })
    }
    const { error } = await supabaseAdmin
      .from('site_media')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'media_archive', target: media.storage_path || req.params.id, details: usedIn.length ? `forced, used by: ${usedIn.map((u) => u.label).join(', ')}` : 'unused' })
    recordContentHistory('media', req.params.id, 'archive', { name: historyLabel(media, 'alt_text', 'url') || 'Image', changes: { status: { from: media.archived_at ? 'Archived' : 'Live', to: 'Archived' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Media archive error')
    res.status(500).json({ error: 'Failed to archive media' })
  }
})

// POST /api/admin/media/:id/restore — undo an archive
router.post('/media/:id/restore', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_media').select(MEDIA_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Media not found' })
    const { data, error } = await supabaseAdmin
      .from('site_media')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(MEDIA_COLUMNS)
      .single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Media not found' })
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'media_restore', target: data.storage_path || req.params.id })
    recordContentHistory('media', data.id, 'restore', { name: historyLabel(before, 'alt_text', 'url') || 'Image', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Live' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Media restore error')
    res.status(500).json({ error: 'Failed to restore media' })
  }
})

// POST /api/admin/media/:id/check — broken-image detection. The storefront
// already hides images that fail in the browser; this is the admin-side flag
// so the owner can find and replace them without clicking every slide.
router.post('/media/:id/check', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: media } = await supabaseAdmin.from('site_media').select(MEDIA_COLUMNS).eq('id', req.params.id).single()
    if (!media) return res.status(404).json({ error: 'Media not found' })
    let broken = true
    try {
      const resp = await fetch(media.url, { method: 'GET', signal: AbortSignal.timeout(8000) })
      broken = !(resp.ok && (resp.headers.get('content-type') || '').startsWith('image/'))
      resp.body?.cancel()
    } catch { broken = true }
    const { data, error } = await supabaseAdmin
      .from('site_media')
      .update({ is_broken: broken, last_broken_at: broken ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(MEDIA_COLUMNS)
      .single()
    if (error) throw error
    res.json({ item: data })
    if (broken) logAudit({ adminEmail: req.userEmail, action: 'media_check_broken', target: media.storage_path || req.params.id })
  } catch (err) {
    logger.error({ err }, 'Media check error')
    res.status(500).json({ error: 'Failed to check media' })
  }
})

// ── Banners admin (admin only) ────────────────────────────────────────────────

const BANNER_COLUMNS = 'id, placement, desktop_image_url, mobile_image_url, alt, title, subtitle, button_text, link_type, link_target, status, starts_at, ends_at, sort_order, impressions, clicks, created_by, created_at, updated_at, archived_at'

// GET /api/admin/banners?placement=home_hero&archived=true
router.get('/banners', requireAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin.from('site_banners').select(BANNER_COLUMNS, { count: 'exact' })
    if (String(req.query.archived) === 'true') query = query.not('archived_at', 'is', null)
    else query = query.is('archived_at', null)
    if (req.query.placement && PLACEMENTS.includes(String(req.query.placement))) {
      query = query.eq('placement', String(req.query.placement))
    }
    const { data, error, count } = await query.order('placement').order('sort_order')
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.json({ items: data || [], total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Banners list error')
    res.status(500).json({ error: 'Failed to load banners' })
  }
})

// POST /api/admin/banners — new banners start as drafts unless told otherwise
router.post('/banners', requireAdmin, async (req, res) => {
  try {
    const clean = sanitizeBanner({ status: 'draft', ...req.body })
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data: last } = await supabaseAdmin
      .from('site_banners')
      .select('sort_order')
      .eq('placement', clean.values.placement)
      .is('archived_at', null)
      .order('sort_order', { ascending: false })
      .limit(1)
    const row = { ...clean.values, sort_order: (last?.[0]?.sort_order ?? -1) + 1, created_by: req.userEmail }
    const { data, error } = await supabaseAdmin.from('site_banners').insert(row).select(BANNER_COLUMNS).single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    invalidateContentCache()
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'banner_create', target: data.id, details: `${data.placement} "${data.alt}" ${data.status}` })
    recordContentHistory('banners', data.id, 'create', data, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Banner create error')
    res.status(500).json({ error: 'Failed to create banner' })
  }
})

// PATCH /api/admin/banners/:id
router.patch('/banners/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_banners').select(BANNER_COLUMNS).eq('id', req.params.id).single()
    if (!before || before.archived_at) return res.status(404).json({ error: 'Banner not found' })
    const clean = sanitizeBanner(req.body, { partial: true })
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data, error } = await supabaseAdmin
      .from('site_banners')
      .update({ ...clean.values, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(BANNER_COLUMNS)
      .single()
    if (error) throw error
    invalidateContentCache()
    res.json({ item: data })
    const changed = Object.keys(clean.values).join(', ')
    logAudit({ adminEmail: req.userEmail, action: 'banner_update', target: req.params.id, details: `changed: ${changed}` })
    recordContentHistory('banners', req.params.id, 'update', { name: historyLabel(before, 'title', 'alt') || 'Banner', changes: diffChanges(before, data, Object.keys(clean.values)) }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Banner update error')
    res.status(500).json({ error: 'Failed to update banner' })
  }
})

// DELETE /api/admin/banners/:id — soft archive so the storefront stops
// serving it immediately and the owner can undo
router.delete('/banners/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_banners').select(BANNER_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Banner not found' })
    const { error } = await supabaseAdmin
      .from('site_banners')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    invalidateContentCache()
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'banner_archive', target: req.params.id, details: `${before.placement} "${before.alt}"` })
    recordContentHistory('banners', req.params.id, 'archive', { name: historyLabel(before, 'title', 'alt') || 'Banner', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Archived' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Banner archive error')
    res.status(500).json({ error: 'Failed to archive banner' })
  }
})

// POST /api/admin/banners/:id/restore
router.post('/banners/:id/restore', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_banners').select(BANNER_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Banner not found' })
    const { data, error } = await supabaseAdmin
      .from('site_banners')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(BANNER_COLUMNS)
      .single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Banner not found' })
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'banner_restore', target: data.id, details: data.placement })
    recordContentHistory('banners', data.id, 'restore', { name: historyLabel(before, 'title', 'alt') || 'Banner', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Live' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Banner restore error')
    res.status(500).json({ error: 'Failed to restore banner' })
  }
})

// POST /api/admin/banners/reorder — body { placement, ids: [uuid, ...] }
// assigns sort_order by array position; owner-facing order control without
// needing drag-and-drop to be keyboard-safe
router.post('/banners/reorder', requireAdmin, async (req, res) => {
  try {
    const { placement, ids } = req.body ?? {}
    if (!PLACEMENTS.includes(placement) || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Provide placement and a non-empty ids list' })
    }
    if (ids.some((id) => !isUuid(id))) return res.status(400).json({ error: 'ids must be uuids' })
    const { data: beforeRows } = await supabaseAdmin.from('site_banners').select('id, title, alt, sort_order').in('id', ids)
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabaseAdmin
        .from('site_banners')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i])
        .eq('placement', placement)
      if (error) throw error
    }
    invalidateContentCache()
    res.json({ success: true, count: ids.length })
    logAudit({ adminEmail: req.userEmail, action: 'banner_reorder', target: placement, details: `${ids.length} banners reordered` })
    const rows = beforeRows || []
    const labelOf = (r) => r?.title || r?.alt || 'Untitled'
    recordContentHistory('banners', placement, 'reorder', {
      name: placement,
      previous: [...rows].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0)).map(labelOf),
      next: ids.map((id) => labelOf(rows.find((r) => r.id === id))),
    }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Banner reorder error')
    res.status(500).json({ error: 'Failed to reorder banners' })
  }
})

// ── Home sections admin (admin only) ──────────────────────────────────────────

const SECTION_COLUMNS = 'id, type, title, config, status, starts_at, ends_at, sort_order, created_by, created_at, updated_at, archived_at'

// GET /api/admin/sections?archived=true
router.get('/sections', requireAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin.from('site_home_sections').select(SECTION_COLUMNS, { count: 'exact' })
    if (String(req.query.archived) === 'true') query = query.not('archived_at', 'is', null)
    else query = query.is('archived_at', null)
    const { data, error, count } = await query.order('sort_order')
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.json({ items: data || [], total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Sections list error')
    res.status(500).json({ error: 'Failed to load sections' })
  }
})

// POST /api/admin/sections — defaults to draft
router.post('/sections', requireAdmin, async (req, res) => {
  try {
    const clean = sanitizeSection({ status: 'draft', ...req.body })
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data: last } = await supabaseAdmin
      .from('site_home_sections')
      .select('sort_order')
      .is('archived_at', null)
      .order('sort_order', { ascending: false })
      .limit(1)
    const row = { ...clean.values, sort_order: (last?.[0]?.sort_order ?? -1) + 1, created_by: req.userEmail }
    const { data, error } = await supabaseAdmin.from('site_home_sections').insert(row).select(SECTION_COLUMNS).single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    invalidateContentCache()
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'section_create', target: data.id, details: `${data.type} "${data.title}" ${data.status}` })
    recordContentHistory('sections', data.id, 'create', data, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Section create error')
    res.status(500).json({ error: 'Failed to create section' })
  }
})

// PATCH /api/admin/sections/:id
router.patch('/sections/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_home_sections').select(SECTION_COLUMNS).eq('id', req.params.id).single()
    if (!before || before.archived_at) return res.status(404).json({ error: 'Section not found' })
    // config validation needs the effective type; callers may omit it on patches
    const clean = sanitizeSection({ type: before.type, ...req.body }, { partial: true })
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data, error } = await supabaseAdmin
      .from('site_home_sections')
      .update({ ...clean.values, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(SECTION_COLUMNS)
      .single()
    if (error) throw error
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'section_update', target: req.params.id, details: `changed: ${Object.keys(clean.values).join(', ')}` })
    recordContentHistory('sections', req.params.id, 'update', { name: historyLabel(before, 'title') || 'Section', changes: diffChanges(before, data, Object.keys(clean.values)) }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Section update error')
    res.status(500).json({ error: 'Failed to update section' })
  }
})

// DELETE /api/admin/sections/:id — soft archive; the storefront stops
// rendering it immediately and it can be restored
router.delete('/sections/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_home_sections').select(SECTION_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Section not found' })
    const { error } = await supabaseAdmin
      .from('site_home_sections')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    invalidateContentCache()
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'section_archive', target: req.params.id, details: `${before.type} "${before.title}"` })
    recordContentHistory('sections', req.params.id, 'archive', { name: historyLabel(before, 'title') || 'Section', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Archived' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Section archive error')
    res.status(500).json({ error: 'Failed to archive section' })
  }
})

// POST /api/admin/sections/:id/restore
router.post('/sections/:id/restore', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_home_sections').select(SECTION_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Section not found' })
    const { data, error } = await supabaseAdmin
      .from('site_home_sections')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(SECTION_COLUMNS)
      .single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Section not found' })
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'section_restore', target: data.id, details: data.type })
    recordContentHistory('sections', data.id, 'restore', { name: historyLabel(before, 'title') || 'Section', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Live' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Section restore error')
    res.status(500).json({ error: 'Failed to restore section' })
  }
})

// POST /api/admin/sections/reorder — body { ids: [...] }; sections are one
// global list (the home page order), not partitioned by placement
router.post('/sections/reorder', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Provide a non-empty ids list' })
    if (ids.some((id) => !isUuid(id))) return res.status(400).json({ error: 'ids must be uuids' })
    const { data: beforeRows } = await supabaseAdmin.from('site_home_sections').select('id, title, sort_order').in('id', ids)
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabaseAdmin
        .from('site_home_sections')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i])
      if (error) throw error
    }
    invalidateContentCache()
    res.json({ success: true, count: ids.length })
    logAudit({ adminEmail: req.userEmail, action: 'section_reorder', target: 'site_home_sections', details: `${ids.length} sections reordered` })
    const rows = beforeRows || []
    const labelOf = (r) => r?.title || 'Untitled'
    recordContentHistory('sections', 'site_home_sections', 'reorder', {
      name: 'Home sections',
      previous: [...rows].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0)).map(labelOf),
      next: ids.map((id) => labelOf(rows.find((r) => r.id === id))),
    }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Section reorder error')
    res.status(500).json({ error: 'Failed to reorder sections' })
  }
})

// ─── Navigation links + category editor (admin only) ─────────────────────────
// Nav links: soft-archive + reorder, same shape as sections. Categories:
// site_categories is an override layer (label / order / visibility) on top of
// the catalog's distinct categories - see utils/navRules.js for the contract.

const NAV_COLUMNS = 'id, section, label, href, image_url, alt_text, sort_order, is_visible, created_at, updated_at, archived_at'

// GET /api/admin/nav-items?section=navbar&archived=true
router.get('/nav-items', requireAdmin, async (req, res) => {
  try {
    if (req.query.section !== undefined && !NAV_SECTIONS.includes(String(req.query.section))) {
      return res.status(400).json({ error: `Section must be one of: ${NAV_SECTIONS.join(', ')}` })
    }
    let query = supabaseAdmin.from('site_nav_items').select(NAV_COLUMNS, { count: 'exact' })
    if (String(req.query.archived) === 'true') query = query.not('archived_at', 'is', null)
    else query = query.is('archived_at', null)
    if (req.query.section !== undefined) query = query.eq('section', String(req.query.section))
    const { data, error, count } = await query.order('sort_order')
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.json({ items: data || [], total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Nav items list error')
    res.status(500).json({ error: 'Failed to load navigation links' })
  }
})

// POST /api/admin/nav-items
router.post('/nav-items', requireAdmin, async (req, res) => {
  try {
    const clean = sanitizeNavItem(req.body)
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data: last } = await supabaseAdmin
      .from('site_nav_items')
      .select('sort_order')
      .eq('section', clean.values.section)
      .is('archived_at', null)
      .order('sort_order', { ascending: false })
      .limit(1)
    const { data, error } = await supabaseAdmin
      .from('site_nav_items')
      .insert({ ...clean.values, sort_order: (last?.[0]?.sort_order ?? -1) + 1 })
      .select(NAV_COLUMNS)
      .single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    invalidateContentCache()
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'nav_create', target: data.id, details: `${data.section} "${data.label}"` })
    recordContentHistory('nav_items', data.id, 'create', data, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Nav item create error')
    res.status(500).json({ error: 'Failed to create navigation link' })
  }
})

// PATCH /api/admin/nav-items/:id
router.patch('/nav-items/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_nav_items').select(NAV_COLUMNS).eq('id', req.params.id).single()
    if (!before || before.archived_at) return res.status(404).json({ error: 'Link not found' })
    const clean = sanitizeNavItem(req.body, { partial: true })
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data, error } = await supabaseAdmin
      .from('site_nav_items')
      .update({ ...clean.values, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(NAV_COLUMNS)
      .single()
    if (error) throw error
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'nav_update', target: req.params.id, details: `changed: ${Object.keys(clean.values).join(', ')}` })
    recordContentHistory('nav_items', req.params.id, 'update', { name: historyLabel(before, 'label') || 'Link', changes: diffChanges(before, data, Object.keys(clean.values)) }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Nav item update error')
    res.status(500).json({ error: 'Failed to update navigation link' })
  }
})

// DELETE /api/admin/nav-items/:id - soft archive; the link stops rendering
// immediately (site-content filters archived rows) and can be restored
router.delete('/nav-items/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_nav_items').select(NAV_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Link not found' })
    const { error } = await supabaseAdmin
      .from('site_nav_items')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    invalidateContentCache()
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'nav_archive', target: req.params.id, details: `${before.section} "${before.label}"` })
    recordContentHistory('nav_items', req.params.id, 'archive', { name: historyLabel(before, 'label') || 'Link', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Archived' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Nav item archive error')
    res.status(500).json({ error: 'Failed to archive navigation link' })
  }
})

// POST /api/admin/nav-items/:id/restore
router.post('/nav-items/:id/restore', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_nav_items').select(NAV_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Link not found' })
    const { data, error } = await supabaseAdmin
      .from('site_nav_items')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(NAV_COLUMNS)
      .single()
    if (error) {
      if (isNoRowError(error)) return res.status(404).json({ error: 'Link not found' })
      throw error
    }
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'nav_restore', target: data.id, details: `${data.section} "${data.label}"` })
    recordContentHistory('nav_items', data.id, 'restore', { name: historyLabel(before, 'label') || 'Link', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Live' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Nav item restore error')
    res.status(500).json({ error: 'Failed to restore navigation link' })
  }
})

// POST /api/admin/nav-items/reorder - body { section, ids }; sort_order is
// per section, and every id is pinned to the section so a cross-section list
// can never renumber another group
router.post('/nav-items/reorder', requireAdmin, async (req, res) => {
  try {
    const { section, ids } = req.body ?? {}
    if (!NAV_SECTIONS.includes(section)) return res.status(400).json({ error: `Section must be one of: ${NAV_SECTIONS.join(', ')}` })
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Provide a non-empty ids list' })
    if (ids.length > 500) return res.status(400).json({ error: 'Too many ids' })
    if (ids.some((id) => !isUuid(id))) return res.status(400).json({ error: 'ids must be uuids' })
    const { data: beforeRows } = await supabaseAdmin.from('site_nav_items').select('id, label, sort_order').eq('section', section).in('id', ids)
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabaseAdmin
        .from('site_nav_items')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i])
        .eq('section', section)
      if (error) throw error
    }
    invalidateContentCache()
    res.json({ success: true, count: ids.length })
    logAudit({ adminEmail: req.userEmail, action: 'nav_reorder', target: 'site_nav_items', details: `${section}: ${ids.length} links reordered` })
    const rows = beforeRows || []
    const labelOf = (r) => r?.label || 'Untitled'
    recordContentHistory('nav_items', section, 'reorder', {
      name: section,
      previous: [...rows].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0)).map(labelOf),
      next: ids.map((id) => labelOf(rows.find((r) => r.id === id))),
    }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Nav item reorder error')
    res.status(500).json({ error: 'Failed to reorder navigation links' })
  }
})

// GET /api/admin/categories - the merged editor list: catalog categories
// (same query + order as the public /products/categories, so the editor shows
// exactly what shoppers get) plus any override rows. Overrides for categories
// no longer in the catalog are ignored here (they never render; a category
// that comes back later simply inherits its saved preferences again).
router.get('/categories', requireAdmin, async (req, res) => {
  try {
    const [catRes, ovRes] = await Promise.all([
      supabaseAdmin.from('product').select('category').eq('is_active', true),
      supabaseAdmin.from('site_categories').select('name, label, sort_order, is_visible'),
    ])
    if (catRes.error) throw catRes.error
    if (ovRes.error) {
      if (isSchemaPendingError(ovRes.error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw ovRes.error
    }
    const baseNames = [...new Set((catRes.data || []).map((r) => r.category).filter(Boolean))].sort()
    const overrides = new Map((ovRes.data || []).map((r) => [r.name, r]))
    const baseIndex = new Map(baseNames.map((name, i) => [name, i]))
    const inCatalog = new Set(baseNames)
    // override rows for names with no active product ("created, waiting for
    // a product") - the editor must show them or they are invisible forever;
    // the storefront merge ignores them because it starts from baseNames
    const orphanNames = [...overrides.keys()].filter((n) => !inCatalog.has(n)).sort()
    orphanNames.forEach((n, k) => baseIndex.set(n, baseNames.length + k))
    const rows = [...baseNames, ...orphanNames].map((name) => ({ name, override: overrides.get(name) }))
    // saved categories first by sort_order, then unsaved in catalog order -
    // mirrors the storefront merge in frontend/lib/siteContent.js
    rows.sort((a, b) => {
      const sa = Number.isInteger(a.override?.sort_order) ? a.override.sort_order : Infinity
      const sb = Number.isInteger(b.override?.sort_order) ? b.override.sort_order : Infinity
      if (sa !== sb) return sa - sb
      return (baseIndex.get(a.name) ?? 0) - (baseIndex.get(b.name) ?? 0)
    })
    res.json({
      items: rows.map(({ name, override }) => ({
        name,
        label: override?.label ?? null,
        sort_order: override?.sort_order ?? null,
        is_visible: override?.is_visible ?? true,
        has_override: Boolean(override),
        in_catalog: inCatalog.has(name),
      })),
      total: rows.length,
    })
  } catch (err) {
    logger.error({ err }, 'Categories merge error')
    res.status(500).json({ error: 'Failed to load categories' })
  }
})

// POST /api/admin/categories - batch save { items: [...], removed?: [...] };
// upserts items (so categories that vanish from the catalog keep their
// preferences), and removes override rows named in `removed` - but only when
// the name has no active product (deleting a live category's preferences by
// accident would be silently confusing). One request per save = one step-up.
router.post('/categories', requireAdmin, async (req, res) => {
  try {
    const clean = sanitizeCategoryBatch(req.body?.items)
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const removal = sanitizeCategoryRemoval(req.body?.removed)
    if (!removal.ok) return res.status(400).json({ error: removal.error })
    const saveNames = new Set(clean.values.map((v) => v.name))
    const clash = removal.values.find((n) => saveNames.has(n))
    if (clash) return res.status(400).json({ error: `"${clash}" cannot be saved and removed in one request` })
    // capture previous values BEFORE any mutation, or the history diff is a lie
    const { data: prevRows, error: prevErr } = await supabaseAdmin
      .from('site_categories')
      .select('name, label, sort_order, is_visible')
      .in('name', [...saveNames])
    if (prevErr) throw prevErr
    let removedCount = 0
    if (removal.values.length > 0) {
      const { data: activeCats, error: catErr } = await supabaseAdmin
        .from('product').select('category').eq('is_active', true)
      if (catErr) throw catErr
      const active = new Set((activeCats || []).map((r) => r.category).filter(Boolean))
      const killable = removal.values.filter((n) => !active.has(n))
      if (killable.length > 0) {
        const { error } = await supabaseAdmin.from('site_categories').delete().in('name', killable)
        if (error) throw error
        removedCount = killable.length
      }
    }
    const now = new Date().toISOString()
    const rows = clean.values.map((v) => ({ ...v, updated_at: now }))
    const { error } = await supabaseAdmin.from('site_categories').upsert(rows, { onConflict: 'name' })
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    invalidateContentCache()
    res.json({ success: true, count: clean.values.length, removed: removedCount })
    logAudit({ adminEmail: req.userEmail, action: 'category_batch_save', target: 'site_categories', details: `${clean.values.length} categories saved${removedCount ? `, ${removedCount} removed` : ''}` })
    // per-category previous vs new values, so the entry reads
    // "Dogs · label: Pet dogs -> Dogs" instead of a jsonb dump
    const prevByName = new Map((prevRows || []).map((r) => [r.name, r]))
    const changes = {}
    for (const row of clean.values) {
      const prev = prevByName.get(row.name)
      for (const field of ['label', 'sort_order', 'is_visible']) {
        const from = prev ? (prev[field] ?? null) : '(not set)'
        const to = row[field] ?? null
        if (JSON.stringify(from) !== JSON.stringify(to)) changes[`${row.name} · ${field}`] = { from, to }
      }
    }
    for (const name of removal.values.filter((n) => !saveNames.has(n))) {
      if (prevByName.has(name)) changes[`${name} · row`] = { from: 'Live', to: 'Removed' }
    }
    recordContentHistory('categories', 'site_categories', 'save', { name: 'Menu categories', changes }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Category batch save error')
    res.status(500).json({ error: 'Failed to save categories' })
  }
})

// ── Content history + restore defaults (Phase 5g) ────────────────────────────

// GET /api/admin/content-history?entity=&entityId=&page=&pageSize=
// newest first; entity is one of banners/sections/nav_items/categories/media
router.get('/content-history', requireAdmin, async (req, res) => {
  try {
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 50, 1), 100)
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    let query = supabaseAdmin.from('site_content_history').select('*', { count: 'exact' })
    if (req.query.entity) query = query.eq('entity', String(req.query.entity))
    if (req.query.entityId) query = query.eq('entity_id', String(req.query.entityId))
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.json({ items: data || [], total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Content history list error')
    res.status(500).json({ error: 'Failed to load content history' })
  }
})

// POST /api/admin/content/restore-defaults { scope }
// Archives every current row in the scope, then inserts the built-in
// defaults fresh. Nothing is hard-deleted, so the owner's rows stay
// restorable from each page's archived view, and the whole operation is one
// history row. If the insert fails the archive is rolled back (unarchive),
// so a failed restore leaves the storefront exactly as it was.
router.post('/content/restore-defaults', requireAdmin, async (req, res) => {
  const { scope } = req.body ?? {}
  const def = defaultRowsFor(scope)
  if (!def) {
    return res.status(400).json({ error: `Scope must be one of: ${RESTORE_SCOPES.join(', ')}` })
  }
  try {
    const now = new Date().toISOString()
    let archQuery = supabaseAdmin
      .from(def.table)
      .update({ archived_at: now, updated_at: now })
      .is('archived_at', null)
    if (def.filter) archQuery = archQuery.eq(def.filter.column, def.filter.value)
    const { data: archivedRows, error: archErr } = await archQuery.select('id')
    if (archErr) {
      if (isSchemaPendingError(archErr)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw archErr
    }
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from(def.table)
      .insert(def.rows.map((r) => ({ ...r, created_by: req.userEmail })))
      .select('*')
    if (insErr) {
      // put the owner's rows back before reporting failure
      const ids = (archivedRows || []).map((r) => r.id)
      if (ids.length) {
        await supabaseAdmin.from(def.table).update({ archived_at: null, updated_at: new Date().toISOString() }).in('id', ids)
      }
      throw insErr
    }
    invalidateContentCache()
    const archivedCount = (archivedRows || []).length
    const restoredCount = (inserted || []).length
    res.json({ success: true, archived: archivedCount, restored: restoredCount })
    logAudit({
      adminEmail: req.userEmail,
      action: 'content_restore_defaults',
      target: `${def.table}:${scope}`,
      details: `archived ${archivedCount}, restored ${restoredCount} default rows`,
    })
    recordContentHistory(
      def.table.replace('site_', ''),
      `scope:${scope}`,
      'reset',
      {
        name: scope,
        archived: archivedCount,
        restored: restoredCount,
        names: (inserted || [])
          .map((r) => historyLabel(r, 'title', 'alt', 'label', 'question', 'slug'))
          .filter(Boolean),
      },
      req.userEmail,
    )
  } catch (err) {
    logger.error({ err }, 'Restore defaults error')
    res.status(500).json({ error: 'Failed to restore defaults' })
  }
})

// ── Site settings, FAQs, and policies (Phase 6) ─────────────────────────────

const FAQ_COLUMNS = 'id, question, answer, sort_order, is_visible, archived_at, created_at, updated_at'
const POLICY_COLUMNS = 'id, slug, title, body, is_visible, archived_at, created_at, updated_at'

// GET /api/admin/settings - the full settings row for the admin form. Before
// the Phase 6 migration this answers the built-in defaults with seeded=false.
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      if (isSchemaPendingError(error)) {
        return res.json({ settings: mergeSettings({}, {}), updated_at: null, updated_by: null, seeded: false })
      }
      throw error
    }
    res.json({
      settings: mergeSettings(data?.data || {}, {}),
      updated_at: data?.updated_at || null,
      updated_by: data?.updated_by || null,
      seeded: Boolean(data),
    })
  } catch (err) {
    logger.error({ err }, 'Settings read error')
    res.status(500).json({ error: 'Failed to load settings' })
  }
})

// PATCH /api/admin/settings - partial update; only validated keys are
// written, merged onto the saved row (defaults fill the rest)
router.patch('/settings', requireAdmin, async (req, res) => {
  const clean = sanitizeSettings(req.body ?? {})
  if (!clean.ok) return res.status(400).json({ error: clean.error })
  if (Object.keys(clean.values).length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' })
  }
  try {
    const { data: current } = await supabaseAdmin.from('site_settings').select('data').eq('id', 1).maybeSingle()
    const merged = mergeSettings(current?.data || {}, clean.values)
    const { data: saved, error } = await supabaseAdmin
      .from('site_settings')
      .upsert(
        { id: 1, data: merged, updated_by: req.userEmail, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      )
      .select('*')
      .single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    // both caches: checkout reads settings through its own reader, the
    // storefront through site-content
    invalidateSettingsCache()
    invalidateContentCache()
    res.json({ settings: mergeSettings(saved.data || {}, {}), updated_at: saved.updated_at, seeded: true })
    logAudit({ adminEmail: req.userEmail, action: 'settings_update', target: 'site_settings', details: `updated: ${Object.keys(clean.values).join(', ')}` })
    recordContentHistory('site_settings', 'site_settings', 'update', {
      name: 'Store settings',
      changes: diffChanges(current?.data || {}, merged, Object.keys(clean.values)),
    }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Settings update error')
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

// GET /api/admin/faqs?archived=true
router.get('/faqs', requireAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin.from('site_faqs').select(FAQ_COLUMNS, { count: 'exact' })
    if (String(req.query.archived) === 'true') query = query.not('archived_at', 'is', null)
    else query = query.is('archived_at', null)
    const { data, error, count } = await query.order('sort_order')
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.json({ items: data || [], total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'FAQ list error')
    res.status(500).json({ error: 'Failed to load FAQs' })
  }
})

// POST /api/admin/faqs
router.post('/faqs', requireAdmin, async (req, res) => {
  try {
    const clean = sanitizeFaq(req.body)
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data: last } = await supabaseAdmin
      .from('site_faqs')
      .select('sort_order')
      .is('archived_at', null)
      .order('sort_order', { ascending: false })
      .limit(1)
    const { data, error } = await supabaseAdmin
      .from('site_faqs')
      .insert({
        ...clean.values,
        sort_order: clean.values.sort_order ?? (last?.[0]?.sort_order ?? -1) + 1,
        created_by: req.userEmail,
      })
      .select(FAQ_COLUMNS)
      .single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    invalidateContentCache()
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'faq_create', target: data.id, details: data.question })
    recordContentHistory('faqs', data.id, 'create', data, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'FAQ create error')
    res.status(500).json({ error: 'Failed to create FAQ' })
  }
})

// PATCH /api/admin/faqs/:id
router.patch('/faqs/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_faqs').select(FAQ_COLUMNS).eq('id', req.params.id).single()
    if (!before || before.archived_at) return res.status(404).json({ error: 'FAQ not found' })
    const clean = sanitizeFaq(req.body)
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data, error } = await supabaseAdmin
      .from('site_faqs')
      .update({ ...clean.values, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(FAQ_COLUMNS)
      .single()
    if (error) throw error
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'faq_update', target: req.params.id, details: `changed: ${Object.keys(clean.values).join(', ')}` })
    recordContentHistory('faqs', req.params.id, 'update', { name: historyLabel(before, 'question') || 'FAQ', changes: diffChanges(before, data, Object.keys(clean.values)) }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'FAQ update error')
    res.status(500).json({ error: 'Failed to update FAQ' })
  }
})

// DELETE /api/admin/faqs/:id - soft archive
router.delete('/faqs/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_faqs').select(FAQ_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'FAQ not found' })
    const { error } = await supabaseAdmin
      .from('site_faqs')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    invalidateContentCache()
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'faq_archive', target: req.params.id, details: before.question })
    recordContentHistory('faqs', req.params.id, 'archive', { name: historyLabel(before, 'question') || 'FAQ', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Archived' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'FAQ archive error')
    res.status(500).json({ error: 'Failed to archive FAQ' })
  }
})

// POST /api/admin/faqs/:id/restore
router.post('/faqs/:id/restore', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_faqs').select(FAQ_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'FAQ not found' })
    const { data, error } = await supabaseAdmin
      .from('site_faqs')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(FAQ_COLUMNS)
      .single()
    if (error) {
      if (isNoRowError(error)) return res.status(404).json({ error: 'FAQ not found' })
      throw error
    }
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'faq_restore', target: data.id, details: data.question })
    recordContentHistory('faqs', data.id, 'restore', { name: historyLabel(before, 'question') || 'FAQ', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Live' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'FAQ restore error')
    res.status(500).json({ error: 'Failed to restore FAQ' })
  }
})

// POST /api/admin/faqs/reorder - body { ids: [...] }
router.post('/faqs/reorder', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Provide a non-empty ids list' })
    if (ids.length > 500) return res.status(400).json({ error: 'Too many ids' })
    if (ids.some((id) => !isUuid(id))) return res.status(400).json({ error: 'ids must be uuids' })
    const { data: beforeRows } = await supabaseAdmin.from('site_faqs').select('id, question, sort_order').in('id', ids)
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabaseAdmin
        .from('site_faqs')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i])
      if (error) throw error
    }
    invalidateContentCache()
    res.json({ success: true, count: ids.length })
    logAudit({ adminEmail: req.userEmail, action: 'faq_reorder', target: 'site_faqs', details: `${ids.length} FAQs reordered` })
    const rows = beforeRows || []
    const labelOf = (r) => r?.question || 'Untitled'
    recordContentHistory('faqs', 'site_faqs', 'reorder', {
      name: 'FAQs',
      previous: [...rows].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0)).map(labelOf),
      next: ids.map((id) => labelOf(rows.find((r) => r.id === id))),
    }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'FAQ reorder error')
    res.status(500).json({ error: 'Failed to reorder FAQs' })
  }
})

// GET /api/admin/policies?archived=true
router.get('/policies', requireAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin.from('site_policies').select(POLICY_COLUMNS, { count: 'exact' })
    if (String(req.query.archived) === 'true') query = query.not('archived_at', 'is', null)
    else query = query.is('archived_at', null)
    const { data, error, count } = await query.order('slug')
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      throw error
    }
    res.json({ items: data || [], total: count ?? 0 })
  } catch (err) {
    logger.error({ err }, 'Policy list error')
    res.status(500).json({ error: 'Failed to load policies' })
  }
})

// POST /api/admin/policies
router.post('/policies', requireAdmin, async (req, res) => {
  try {
    const clean = sanitizePolicy(req.body)
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    const { data, error } = await supabaseAdmin
      .from('site_policies')
      .insert({ ...clean.values, created_by: req.userEmail })
      .select(POLICY_COLUMNS)
      .single()
    if (error) {
      if (isSchemaPendingError(error)) return res.status(503).json({ error: 'MIGRATION_REQUIRED' })
      if (error.code === '23505') return res.status(409).json({ error: 'A policy with that slug already exists' })
      throw error
    }
    invalidateContentCache()
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'policy_create', target: data.slug, details: data.title })
    recordContentHistory('policies', data.id, 'create', data, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Policy create error')
    res.status(500).json({ error: 'Failed to create policy' })
  }
})

// PATCH /api/admin/policies/:id
router.patch('/policies/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_policies').select(POLICY_COLUMNS).eq('id', req.params.id).single()
    if (!before || before.archived_at) return res.status(404).json({ error: 'Policy not found' })
    const clean = sanitizePolicy({ ...req.body, slug: req.body?.slug ?? before.slug })
    if (!clean.ok) return res.status(400).json({ error: clean.error })
    if (clean.values.slug !== before.slug) {
      const { data: clash } = await supabaseAdmin.from('site_policies').select('id').eq('slug', clean.values.slug).maybeSingle()
      if (clash) return res.status(409).json({ error: 'A policy with that slug already exists' })
    }
    const { data, error } = await supabaseAdmin
      .from('site_policies')
      .update({ ...clean.values, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(POLICY_COLUMNS)
      .single()
    if (error) throw error
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'policy_update', target: req.params.id, details: `changed: ${Object.keys(clean.values).join(', ')}` })
    recordContentHistory('policies', req.params.id, 'update', { name: historyLabel(before, 'title') || 'Policy', changes: diffChanges(before, data, Object.keys(clean.values)) }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Policy update error')
    res.status(500).json({ error: 'Failed to update policy' })
  }
})

// DELETE /api/admin/policies/:id - soft archive
router.delete('/policies/:id', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_policies').select(POLICY_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Policy not found' })
    const { error } = await supabaseAdmin
      .from('site_policies')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    invalidateContentCache()
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'policy_archive', target: req.params.id, details: `${before.slug} "${before.title}"` })
    recordContentHistory('policies', req.params.id, 'archive', { name: historyLabel(before, 'title') || 'Policy', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Archived' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Policy archive error')
    res.status(500).json({ error: 'Failed to archive policy' })
  }
})

// POST /api/admin/policies/:id/restore
router.post('/policies/:id/restore', requireAdmin, async (req, res) => {
  if (!requireUuidParam(req, res)) return
  try {
    const { data: before } = await supabaseAdmin.from('site_policies').select(POLICY_COLUMNS).eq('id', req.params.id).single()
    if (!before) return res.status(404).json({ error: 'Policy not found' })
    const { data, error } = await supabaseAdmin
      .from('site_policies')
      .update({ archived_at: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(POLICY_COLUMNS)
      .single()
    if (error) {
      if (isNoRowError(error)) return res.status(404).json({ error: 'Policy not found' })
      throw error
    }
    invalidateContentCache()
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'policy_restore', target: data.id, details: `${data.slug} "${data.title}"` })
    recordContentHistory('policies', data.id, 'restore', { name: historyLabel(before, 'title') || 'Policy', changes: { status: { from: before.archived_at ? 'Archived' : 'Live', to: 'Live' } } }, req.userEmail)
  } catch (err) {
    logger.error({ err }, 'Policy restore error')
    res.status(500).json({ error: 'Failed to restore policy' })
  }
})

// ─── Promo CRUD (admin only) ─────────────────────────────────────────────────

// GET /api/admin/promos — list all promos
router.get('/promos', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('promos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    logger.error({ err }, 'Promos list error')
    res.status(500).json({ error: 'Failed to load promos' })
  }
})

// GET /api/admin/promos/:code — single promo
router.get('/promos/:code', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Invalid promo code' })
  try {
    const { data, error } = await supabaseAdmin
      .from('promos')
      .select('*')
      .eq('code', code)
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Promo not found' })
    res.json(data)
  } catch (err) {
    logger.error({ err }, 'Promo detail error')
    res.status(500).json({ error: 'Failed to load promo' })
  }
})

// POST /api/admin/promos — create promo
router.post('/promos', requireAdmin, async (req, res) => {
  const {
    code, type, value, scope, target_id, min_subtotal,
    max_discount, usage_limit, per_user_limit,
    starts_at, ends_at, is_active,
  } = req.body ?? {}

  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: 'code, type, and value are required' })
  }
  if (!['percent', 'fixed', 'free_shipping'].includes(type)) {
    return res.status(400).json({ error: 'type must be percent, fixed, or free_shipping' })
  }
  if (!['sitewide', 'category', 'product'].includes(scope || 'sitewide')) {
    return res.status(400).json({ error: 'scope must be sitewide, category, or product' })
  }
  if (value < 0) return res.status(400).json({ error: 'value must be >= 0' })
  if ((min_subtotal ?? 0) < 0) return res.status(400).json({ error: 'min_subtotal must be >= 0' })
  if (max_discount !== undefined && max_discount !== null && max_discount < 0) {
    return res.status(400).json({ error: 'max_discount must be >= 0' })
  }
  if (usage_limit !== undefined && usage_limit !== null && usage_limit < 1) {
    return res.status(400).json({ error: 'usage_limit must be >= 1' })
  }
  if (per_user_limit !== undefined && per_user_limit < 1) {
    return res.status(400).json({ error: 'per_user_limit must be >= 1' })
  }
  if (scope !== 'sitewide' && !target_id) {
    return res.status(400).json({ error: 'target_id is required for category/product scope' })
  }

  const promoCode = String(code).trim().toUpperCase()

  try {
    const { data, error } = await supabaseAdmin
      .from('promos')
      .insert({
        code: promoCode,
        type,
        value: Number(value),
        scope: scope || 'sitewide',
        target_id: target_id || null,
        min_subtotal: Number(min_subtotal || 0),
        max_discount: max_discount === null || max_discount === undefined ? null : Number(max_discount),
        usage_limit: usage_limit === null || usage_limit === undefined ? null : Number(usage_limit),
        per_user_limit: Number(per_user_limit || 1),
        starts_at: starts_at || new Date().toISOString(),
        ends_at: ends_at || null,
        is_active: is_active ?? true,
      })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Promo code already exists' })
      throw error
    }
    invalidateContentCache()
    res.status(201).json(data)
    logAudit({ adminEmail: req.userEmail, action: 'promo_create', target: promoCode })
  } catch (err) {
    logger.error({ err }, 'Promo create error')
    res.status(500).json({ error: 'Failed to create promo' })
  }
})

// PATCH /api/admin/promos/:code — update promo
router.patch('/promos/:code', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Invalid promo code' })

  const {
    type, value, scope, target_id, min_subtotal,
    max_discount, usage_limit, per_user_limit,
    starts_at, ends_at, is_active,
  } = req.body ?? {}

  const updates = { updated_at: new Date().toISOString() }
  if (type !== undefined) {
    if (!['percent', 'fixed', 'free_shipping'].includes(type)) {
      return res.status(400).json({ error: 'type must be percent, fixed, or free_shipping' })
    }
    updates.type = type
  }
  if (value !== undefined) {
    if (value < 0) return res.status(400).json({ error: 'value must be >= 0' })
    updates.value = Number(value)
  }
  if (scope !== undefined) {
    if (!['sitewide', 'category', 'product'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be sitewide, category, or product' })
    }
    updates.scope = scope
  }
  if (target_id !== undefined) updates.target_id = target_id || null
  if (min_subtotal !== undefined) {
    if (min_subtotal < 0) return res.status(400).json({ error: 'min_subtotal must be >= 0' })
    updates.min_subtotal = Number(min_subtotal)
  }
  if (max_discount !== undefined) {
    if (max_discount !== null && max_discount < 0) return res.status(400).json({ error: 'max_discount must be >= 0' })
    updates.max_discount = max_discount === null ? null : Number(max_discount)
  }
  if (usage_limit !== undefined) {
    if (usage_limit !== null && usage_limit < 1) return res.status(400).json({ error: 'usage_limit must be >= 1' })
    updates.usage_limit = usage_limit === null ? null : Number(usage_limit)
  }
  if (per_user_limit !== undefined) {
    if (per_user_limit < 1) return res.status(400).json({ error: 'per_user_limit must be >= 1' })
    updates.per_user_limit = Number(per_user_limit)
  }
  if (starts_at !== undefined) updates.starts_at = starts_at
  if (ends_at !== undefined) updates.ends_at = ends_at || null
  if (is_active !== undefined) updates.is_active = Boolean(is_active)

  if (updates.scope !== 'sitewide' && (updates.target_id === null || updates.target_id === undefined)) {
    const { data: current } = await supabaseAdmin.from('promos').select('scope, target_id').eq('code', code).maybeSingle()
    const effectiveScope = updates.scope ?? current?.scope
    const effectiveTarget = updates.target_id ?? current?.target_id
    if (effectiveScope !== 'sitewide' && !effectiveTarget) {
      return res.status(400).json({ error: 'target_id is required for category/product scope' })
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('promos')
      .update(updates)
      .eq('code', code)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Promo not found' })
    invalidateContentCache()
    res.json(data)
    logAudit({ adminEmail: req.userEmail, action: 'promo_update', target: code })
  } catch (err) {
    logger.error({ err }, 'Promo update error')
    res.status(500).json({ error: 'Failed to update promo' })
  }
})

// DELETE /api/admin/promos/:code — delete promo
router.delete('/promos/:code', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Invalid promo code' })
  try {
    const { error } = await supabaseAdmin.from('promos').delete().eq('code', code)
    if (error) throw error
    invalidateContentCache()
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'promo_delete', target: code })
  } catch (err) {
    logger.error({ err }, 'Promo delete error')
    res.status(500).json({ error: 'Failed to delete promo' })
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
