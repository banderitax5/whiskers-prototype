// client-side SEO meta for product pages.
// This app is a client-rendered SPA (Vite + React Router), so crawlers and most
// link-preview scrapers will NOT see these per-product tags — they only read the
// static index.html. Setting them here still updates the browser tab title and
// improves some in-app / mobile share sheets. Real per-product previews would
// need SSR or prerendering (out of scope).
const DEFAULT_TITLE = 'Whiskers — Personalized Pet Food Recommendations'
const DEFAULT_DESCRIPTION = 'Find the best food for your pet based on their health profile. Whiskers provides personalized pet food recommendations for dogs, cats, and more.'

function upsertMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// apply per-product title/description/OG tags; returns a cleanup that restores
// the site defaults (so navigating away never leaves a stale product title)
export function setProductSeo(product) {
  const name = product?.name || product?.prod_name || ''
  const price = Number(product?.price) || 0
  const title = name ? `${name} — Whiskers Petshop` : DEFAULT_TITLE
  const description = name
    ? `Buy ${name}${price > 0 ? ` for PHP ${price.toFixed(2)}` : ''} at Whiskers Petshop. Shop pet food and supplies with personalized recommendations.`
    : DEFAULT_DESCRIPTION

  const prevTitle = document.title
  document.title = title
  upsertMeta('name', 'description', description)

  // Open Graph only when there is a real image_url; bytea image_data cannot be
  // used for previews and no product currently stores it anyway
  const imageUrl = product?.image || product?.image_url
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:type', 'website')
  if (imageUrl) upsertMeta('property', 'og:image', imageUrl)

  return () => {
    document.title = prevTitle || DEFAULT_TITLE
    upsertMeta('name', 'description', DEFAULT_DESCRIPTION)
  }
}
