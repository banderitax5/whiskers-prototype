import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { supabaseAdmin } from '../config/supabase.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'
import { decryptText } from '../utils/encryption.js'

const router = Router()

// every admin endpoint requires a valid session and the 'admin' role
router.use(authMiddleware, requireAdmin)

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
router.get('/stats', async (req, res) => {
  try {
    const [usersHead, productsHead, ordersHead, salesHead, paymentsHead] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabaseAdmin.from('product').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('sales').select('total_amount, profit'),
      supabaseAdmin.from('payment').select('amount'),
    ])

    const totalSales = (salesHead.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
    const totalProfit = (salesHead.data || []).reduce((s, r) => s + Number(r.profit || 0), 0)
    const totalRevenue = (paymentsHead.data || []).reduce((s, r) => s + Number(r.amount || 0), 0)

    const { count: pendingOrders } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')

    res.json({
      totalUsers: usersHead.count ?? 0,
      totalProducts: productsHead.count ?? 0,
      totalOrders: ordersHead.count ?? 0,
      pendingOrders: pendingOrders ?? 0,
      totalSales,
      totalProfit,
      totalRevenue,
    })
  } catch (err) {
    console.error('Admin stats error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/customers - every regular user plus their latest feedback
router.get('/customers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone, role, feedback(comments)')
      .order('first_name', { ascending: true })
    if (error) throw error

    const customers = (data || []).map((u) => ({
      ...formatProfile(u),
      feedback: u.feedback?.[0]?.comments || null,
    }))
    res.json({ items: customers })
  } catch (err) {
    console.error('Admin customers error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/customers/:id/role
// body: { role } — must be 'user' or 'admin'
// prevents admin from demoting themselves
router.patch('/customers/:id/role', async (req, res) => {
  const { role } = req.body ?? {}
  const ALLOWED_ROLES = ['user', 'admin']

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
    if (error) throw error
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'role_change', target: `user:${req.params.id}`, details: `role -> ${role}` })
  } catch (err) {
    console.error('Admin role update error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    console.error('Admin products list error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/admin/products
router.post('/products', async (req, res) => {
  const { prod_name, category, price, stock_quantity, image_url } = req.body ?? {}
  if (!prod_name || !category || price == null) {
    return res.status(400).json({ error: 'prod_name, category, and price are required' })
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .insert({
        prod_name,
        category,
        price: Number(price),
        stock_quantity: Number(stock_quantity || 0),
        image_url: image_url || null,
      })
      .select()
      .single()
    if (error) throw error
    res.status(201).json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'create', target: `product:${data.prod_id}`, details: prod_name })
  } catch (err) {
    console.error('Admin product create error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  const allowed = ['prod_name', 'category', 'price', 'stock_quantity', 'image_url']
  const updates = {}
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key]
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' })
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('product')
      .update(updates)
      .eq('prod_id', req.params.id)
      .select()
      .single()
    if (error) throw error
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'update', target: `product:${req.params.id}`, details: Object.keys(updates).join(', ') })
  } catch (err) {
    console.error('Admin product update error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    // Fetch product to get image_url for cleanup
    const { data: product } = await supabaseAdmin
      .from('product')
      .select('image_url')
      .eq('prod_id', req.params.id)
      .single()

    // Delete image from Storage if it exists
    const filename = extractStorageFilename(product?.image_url)
    if (filename) {
      await supabaseAdmin.storage.from('product-images').remove([filename]).catch(() => {})
    }

    const { error } = await supabaseAdmin.from('product').delete().eq('prod_id', req.params.id)
    if (error) throw error
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'delete', target: `product:${req.params.id}` })
  } catch (err) {
    console.error('Admin product delete error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/payments - all payments with the buyer's name and order status
router.get('/payments', async (req, res) => {
  try {
    // get all payments
    const { data: payments, error: payErr } = await supabaseAdmin
      .from('payment')
      .select('payment_id, amount, method, payment_date, order_id')
      .order('payment_date', { ascending: false })
    if (payErr) throw payErr

    // get all orders to look up user_id and status
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('order_id, id, status')

    // get all profiles to look up names
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')

    const orderMap = new Map((orders || []).map(o => [o.order_id, o]))
    const profileMap = new Map((profiles || []).map(p => [p.id, p]))

    const items = (payments || []).map((p) => {
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
    res.json({ items })
  } catch (err) {
    console.error('Admin payments error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/orders
// query: ?status=Pending|Shipped|... to filter
// returns every order joined with its buyer and line items
router.get('/orders', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (req.query.status) {
      query = query.eq('status', String(req.query.status))
    }

    const { data: orders, error } = await query
    if (error) throw error

    // get profiles for the user names
    const userIds = [...new Set((orders || []).map(o => o.id))]
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', userIds)

    const profileMap = new Map((profiles || []).map(p => [p.id, p]))

    // get line items for these orders
    const orderIds = (orders || []).map(o => o.order_id)
    const { data: details, error: detailsErr } = await supabaseAdmin
      .from('order_details')
      .select('order_id, prod_id, quantity, subtotal')
      .in('order_id', orderIds)
    if (detailsErr) console.error('order_details fetch error:', detailsErr)

    // get product names separately
    const prodIds = [...new Set((details || []).map(d => d.prod_id).filter(Boolean))]
    const { data: products, error: prodErr } = await supabaseAdmin
      .from('product')
      .select('prod_id, prod_name')
      .in('prod_id', prodIds)
    if (prodErr) console.error('product fetch error:', prodErr)
    const prodMap = new Map((products || []).map(p => [p.prod_id, p.prod_name]))

    const detailsMap = new Map()
    for (const d of (details || [])) {
      if (!detailsMap.has(d.order_id)) detailsMap.set(d.order_id, [])
      detailsMap.get(d.order_id).push(d)
    }

    // get payment records
    const { data: payments } = await supabaseAdmin
      .from('payment')
      .select('order_id, amount, method, payment_date')
      .in('order_id', orderIds)
    const paymentMap = new Map()
    for (const p of (payments || [])) {
      if (!paymentMap.has(p.order_id)) paymentMap.set(p.order_id, p)
    }

    const items = (orders || []).map((o) => {
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
    res.json({ items })
  } catch (err) {
    console.error('Admin orders list error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/orders/:id
// body: { status }
// updates the order's lifecycle status (Pending -> Shipped -> Delivered etc)
router.patch('/orders/:id', async (req, res) => {
  const { status } = req.body ?? {}
  if (!status || typeof status !== 'string') {
    return res.status(400).json({ error: 'status is required' })
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('order_id', req.params.id)
      .select('order_id, status, created_at')
      .single()
    if (error) throw error
    res.json({ item: data })
    logAudit({ adminEmail: req.userEmail, action: 'status', target: `order:${req.params.id}`, details: `status -> ${status}` })
  } catch (err) {
    console.error('Admin order update error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/admin/orders/:id/items
// returns the line items for one order, joined with the product row so the
// admin sees the snapshot of what was actually bought
router.get('/orders/:id/items', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('order_details')
      .select('orderdet_id, order_id, prod_id, quantity, subtotal, product:prod_id(prod_id, prod_name, image_url, price)')
      .eq('order_id', req.params.id)
    if (error) throw error
    res.json({ items: data || [] })
  } catch (err) {
    console.error('Admin order items error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/admin/order-items/:id
// body: { quantity, subtotal? }
// updates a single line item (used to fix mistakes or adjust qty)
router.patch('/order-items/:id', async (req, res) => {
  const updates = {}
  if (req.body?.quantity !== undefined) {
    const q = Number(req.body.quantity)
    if (!Number.isFinite(q) || q < 1) {
      return res.status(400).json({ error: 'quantity must be >= 1' })
    }
    updates.quantity = q
  }
  if (req.body?.subtotal !== undefined) {
    const p = Number(req.body.subtotal)
    if (!Number.isFinite(p) || p < 0) {
      return res.status(400).json({ error: 'subtotal must be >= 0' })
    }
    updates.subtotal = p
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'quantity or subtotal is required' })
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('order_details')
      .update(updates)
      .eq('orderdet_id', req.params.id)
      .select()
      .single()
    if (error) throw error
    res.json({ item: data })
  } catch (err) {
    console.error('Admin order item update error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/order-items/:id
router.delete('/order-items/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('order_details')
      .delete()
      .eq('orderdet_id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('Admin order item delete error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/orders/:id
// cascades: deletes order_details + payment rows first, then the order
router.delete('/orders/:id', async (req, res) => {
  const orderId = req.params.id
  try {
    // delete payment
    await supabaseAdmin.from('payment').delete().eq('order_id', orderId)
    // delete order_details
    await supabaseAdmin.from('order_details').delete().eq('order_id', orderId)
    // delete the order itself
    const { error } = await supabaseAdmin.from('orders').delete().eq('order_id', orderId)
    if (error) throw error
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'delete', target: `order:${orderId}` })
  } catch (err) {
    console.error('Admin order delete error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/admin/payments/:id
router.delete('/payments/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('payment')
      .delete()
      .eq('payment_id', req.params.id)
    if (error) throw error
    res.json({ success: true })
    logAudit({ adminEmail: req.userEmail, action: 'delete', target: `payment:${req.params.id}` })
  } catch (err) {
    console.error('Admin payment delete error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Audit Logs ────────────────────────────────────────────────────────────────

// GET /api/admin/audit-logs
// query: ?limit=100 (default 100, max 500)
router.get('/audit-logs', async (req, res) => {
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
    console.error('Admin audit logs error:', err)
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
    console.error('Audit log write failed:', err)
  }
}

// ── Image Upload / Delete ──────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
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

// POST /api/admin/images/upload
// Accepts multipart file (field: "image") OR JSON { imageUrl }
router.post('/images/upload', upload.single('image'), async (req, res) => {
  try {
    let fileBuffer
    let ext = 'jpg'

    if (req.file) {
      fileBuffer = await sharp(req.file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    } else if (req.body?.imageUrl) {
      const resp = await fetch(req.body.imageUrl)
      if (!resp.ok) return res.status(400).json({ error: 'Failed to fetch image from URL' })

      const remoteType = resp.headers.get('content-type') || ''
      if (!remoteType.startsWith('image/')) return res.status(400).json({ error: 'URL does not point to an image' })

      const arrayBuf = await resp.arrayBuffer()
      fileBuffer = await sharp(Buffer.from(arrayBuf))
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    } else {
      return res.status(400).json({ error: 'Provide an image file or imageUrl' })
    }

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
        console.error('Bucket create error:', createErr)
        return res.status(500).json({ error: 'Failed to create storage bucket: ' + createErr.message })
      }
    }

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('product-images')
      .upload(fileName, fileBuffer, { contentType: 'image/jpeg' })
    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return res.status(500).json({ error: 'Storage upload failed: ' + uploadError.message })
    }

    const { data } = supabaseAdmin.storage.from('product-images').getPublicUrl(fileName)
    res.status(201).json({ url: data.publicUrl })
  } catch (err) {
    console.error('Image upload error:', err)
    res.status(500).json({ error: 'Failed to upload image: ' + err.message })
  }
})

// DELETE /api/admin/images/:filename
router.delete('/images/:filename', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.storage
      .from('product-images')
      .remove([req.params.filename])
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('Image delete error:', err)
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
