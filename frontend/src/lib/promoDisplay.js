// Sale-price display: computes whether a product is covered by an active
// percent promo and what its discounted price is, for badges and strikethroughs.
// Only percent promos affect the sticker price - fixed-amount and
// free-shipping promos are cart-level and shown at checkout instead.
// Scope matching mirrors the backend promoEngine (string equality on the
// category name / product id stored in target_id).

import { useEffect, useState } from 'react'
import { fetchSiteContent } from './siteContent'

export function contentPromos(content) {
  if (!content || !Array.isArray(content.promos)) return []
  return content.promos
}

export function saleFor(product, promos) {
  const price = Number(product?.price)
  if (!Number.isFinite(price) || price <= 0 || !Array.isArray(promos)) return null
  let bestPct = 0
  for (const promo of promos) {
    if (promo?.type !== 'percent' || !(Number(promo.value) > 0)) continue
    const inScope =
      promo.scope === 'sitewide' ||
      (promo.scope === 'category' && promo.target_id && product.category === promo.target_id) ||
      (promo.scope === 'product' && promo.target_id && (product.prod_id === promo.target_id || product.id === promo.target_id))
    if (!inScope) continue
    const pct = Math.min(99, Number(promo.value))
    if (pct > bestPct) bestPct = pct
  }
  if (bestPct <= 0) return null
  const salePrice = Math.round(price * (100 - bestPct)) / 100
  if (!(salePrice > 0) || salePrice >= price) return null
  return { salePrice, discountPct: Math.round(bestPct) }
}

// cached active promos for the current page load (same fetch the homepage
// content uses); null until loaded, [] when nothing is on sale
export function useActivePromos() {
  const [promos, setPromos] = useState(() => [])
  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((data) => {
      if (!cancelled) setPromos(contentPromos(data))
    })
    return () => {
      cancelled = true
    }
  }, [])
  return promos
}
