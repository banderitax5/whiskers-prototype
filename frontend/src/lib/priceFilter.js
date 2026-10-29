// Price filter maths for the Menu page, kept out of the component so the
// boundary cases are testable without mounting a router + shop context.
//
// The filter is max-only on purpose. The catalog runs PHP 1 - 6,000 with a
// median of 200, so a minimum thumb would sit at the far left for almost every
// search, and "show me the expensive end" is already covered by sorting
// Price: High to Low.

export const PRICE_STEP = 50
export const MIN_CEILING = 1000

// Top of the slider: the highest price in the loaded catalog, rounded up to the
// next PHP 500 so "no limit" sits at the end of the track. Derived from the
// whole catalog rather than the filtered result, otherwise the track would
// shrink while the shopper drags.
export function priceCeilingFor(products = []) {
  const highest = products.reduce((max, product) => {
    const value = Number(product?.price) || 0
    return value > max ? value : max
  }, 0)
  return Math.max(MIN_CEILING, Math.ceil(highest / 500) * 500)
}

// Slider position for the current filter value. 'all' and anything unparseable
// both mean "no limit", which is the right-hand end of the track.
export function sliderValueFor(maxPrice, ceiling) {
  if (maxPrice === 'all') return ceiling
  const value = Number(maxPrice)
  if (!Number.isFinite(value) || value <= 0) return ceiling
  return Math.min(value, ceiling)
}

// What to store in filter state / the URL when the thumb moves. Reaching the
// end of the track means "no limit", so the URL drops the parameter entirely
// instead of pinning today's ceiling.
export function maxPriceFromSlider(value, ceiling) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric >= ceiling) return 'all'
  return String(Math.max(0, Math.round(numeric)))
}

// A product matches when it has a price and that price is at or below the cap.
// Unpriced rows (price 0) never match a capped search: they are not purchasable.
export function matchesMaxPrice(price, maxPrice) {
  if (maxPrice === 'all') return true
  const cap = Number(maxPrice)
  if (!Number.isFinite(cap)) return true
  const value = Number(price) || 0
  return value > 0 && value <= cap
}
