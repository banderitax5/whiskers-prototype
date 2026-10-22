// shared product display helpers used by the quick view modal, the product
// detail page, and the related-products strip so stock/price logic stays in
// one place instead of being copied around.

import { useEffect, useState } from 'react'
import { fetchSiteContent, contentSettings } from './siteContent.js'

// fallback for the "low stock" warning before site settings load (and for a
// fresh install with no content endpoint). The owner-editable value in site
// settings (low_stock_threshold) overrides this via useLowStockThreshold;
// both default to 10 so the admin stat and the storefront chips agree.
export const LOW_STOCK_THRESHOLD = 10

// normalize a raw product row (API) or a hardcoded product into the shape the
// UI components expect. The API returns prod_name/image_url/category; some
// callers pass name/image/collection. This mirrors what the modal already did.
export function normalizeProduct(raw) {
  if (!raw) return null
  return {
    ...raw,
    id: raw.id || raw.prod_id,
    prod_id: raw.prod_id || raw.id,
    name: raw.name || raw.prod_name || '',
    image: raw.image || raw.image_url || '',
    collection: raw.collection || raw.category || '',
    brand: raw.brand || '',
    category: raw.category || raw.collection || '',
    price: Number(raw.price) || 0,
  }
}

// format a price for display; returns null when there is no price so callers
// can render a "price not yet set" state instead of PHP 0.00
export function formatPrice(price) {
  const n = Number(price)
  return Number.isFinite(n) && n > 0 ? `PHP ${n.toFixed(2)}` : null
}

// derive stock status from stock_quantity. Missing/NaN stock is treated as
// unknown (in stock) so products without stock data are still purchasable.
// threshold is the owner-editable low_stock_threshold (see useLowStockThreshold);
// it defaults to LOW_STOCK_THRESHOLD so pure callers and tests keep working.
// returns { stock, hasStockInfo, inStock, lowStock }
export function getStockStatus(stock_quantity, threshold = LOW_STOCK_THRESHOLD) {
  const stock = Number(stock_quantity)
  const hasStockInfo = Number.isFinite(stock)
  const inStock = !hasStockInfo || stock > 0
  const t = Number(threshold)
  const limit = Number.isFinite(t) && t >= 0 ? t : LOW_STOCK_THRESHOLD
  const lowStock = hasStockInfo && stock > 0 && stock <= limit
  return { stock, hasStockInfo, inStock, lowStock }
}

// the owner's low-stock threshold from site settings, or the built-in
// default while loading / when the endpoint is unavailable. One cached
// fetch per page load (same snapshot the storefront content uses).
export function useLowStockThreshold() {
  const [threshold, setThreshold] = useState(LOW_STOCK_THRESHOLD)
  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((content) => {
      if (cancelled || !content) return
      const t = Number(contentSettings(content).low_stock_threshold)
      if (Number.isFinite(t) && t >= 0) setThreshold(t)
    })
    return () => { cancelled = true }
  }, [])
  return threshold
}

// a product can be added to cart only when it has a real price and stock
export function isPurchasable(product) {
  const p = normalizeProduct(product)
  if (!p) return false
  const { inStock } = getStockStatus(product?.stock_quantity)
  return p.price > 0 && inStock
}

// build the cart payload passed to ShopContext.addToCart from a product row.
// keeps the exact same field mapping the Menu and modal already use so the
// detail page writes the identical cart_items row (product_id column).
export function toCartPayload(product) {
  const p = normalizeProduct(product)
  return {
    id: p.prod_id,
    name: p.name,
    price: p.price,
    image: p.image,
    collection: p.category,
    brand: p.brand,
  }
}
