// Resolves a banner's stored link_type/link_target into an href the router
// understands. Returns null when there is no usable destination (including
// legacy values the admin can no longer safely interpret) so callers render
// the banner as plain content instead of sending shoppers somewhere wrong.

export function bannerHref(banner) {
  if (!banner || !banner.link_target || !banner.link_type || banner.link_type === 'none') return null
  const t = String(banner.link_target).trim()
  if (!t) return null
  switch (banner.link_type) {
    case 'product':
      if (t.startsWith('/products/')) return t
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? `/products/${t}` : null
    case 'category':
      return t.startsWith('/') ? t : null
    case 'promo':
      return t.startsWith('/') ? t : null
    case 'brand':
      // pickers store /menu?brand=Name; legacy rows stored the bare brand
      // name, which is exactly what this link type means
      if (t.startsWith('/menu?')) return t
      return `/menu?brand=${encodeURIComponent(t)}`
    case 'url':
      return /^https?:\/\//i.test(t) || t.startsWith('/') ? t : null
    default:
      return null
  }
}
