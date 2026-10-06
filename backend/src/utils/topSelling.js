import { supabaseAdmin } from '../config/supabase.js'

// Top selling products by quantity sold, aggregated from order_details.
// Shared by the admin sales analytics ("Top Selling Products") and the public
// search bar "Trending" list so both always show the same ranking.
export async function getTopSellingProducts(limit = 10) {
  const { data: details, error } = await supabaseAdmin
    .from('order_details')
    .select('prod_id, quantity, subtotal')
  if (error) throw error

  const prodQty = {}
  const prodRevenue = {}
  for (const d of details || []) {
    if (!d.prod_id) continue
    prodQty[d.prod_id] = (prodQty[d.prod_id] || 0) + Number(d.quantity || 0)
    prodRevenue[d.prod_id] = (prodRevenue[d.prod_id] || 0) + Number(d.subtotal || 0)
  }

  const ids = Object.entries(prodQty)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, limit))
    .map(([id]) => id)
  if (ids.length === 0) return []

  const { data: prods, error: prodErr } = await supabaseAdmin
    .from('product')
    .select('prod_id, prod_name, category, brand, price, image_url, is_active')
    .in('prod_id', ids)
  if (prodErr) throw prodErr

  const prodMap = Object.fromEntries((prods || []).map(p => [String(p.prod_id), p]))

  return ids.map(id => {
    const p = prodMap[String(id)] || {}
    return {
      prod_id: id,
      prod_name: p.prod_name || `Product #${id}`,
      category: p.category || null,
      brand: p.brand || null,
      price: p.price ?? null,
      image_url: p.image_url || null,
      is_active: p.is_active !== false,
      quantity: prodQty[id],
      revenue: Math.round((prodRevenue[id] || 0) * 100) / 100,
    }
  })
}
