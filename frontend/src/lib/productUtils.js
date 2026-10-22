// utility functions for grouping products by size variants
// products like "Royal Canin Mini Puppy 2kg" and "Royal Canin Mini Puppy 8kg"
// share the same base name but have different weights embedded in the name

// matches weight patterns at the end of a product name: "1.5kg", "500g", "10Kg", "22.73kg", "85g", "375g", etc.
const WEIGHT_PATTERN = /\s+\d+(\.\d+)?\s*(kg|g|lb|oz|ml|l)\b\s*$/i

// extract the size/weight label from a product name (e.g. "1.5kg", "500g")
export function extractSizeLabel(name) {
  if (!name) return ''
  const match = name.match(WEIGHT_PATTERN)
  return match ? match[0].trim() : ''
}

// get the base name by stripping the trailing weight (e.g. "Royal Canin Mini Puppy")
export function getBaseName(name) {
  if (!name) return ''
  return name.replace(WEIGHT_PATTERN, '').trim()
}

// group an array of products by their base name
// returns a Map: baseName -> [product, product, ...]
export function groupByBaseName(products) {
  const groups = new Map()
  for (const product of products) {
    const name = product.prod_name || product.name || ''
    const base = getBaseName(name)
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push(product)
  }
  return groups
}

// attach sizeVariants to each product in the list
// products with only one variant get an empty sizeVariants array
// products with multiple variants get the full list of siblings
export function attachSizeVariants(products) {
  const groups = groupByBaseName(products)
  return products.map((product) => {
    const name = product.prod_name || product.name || ''
    const base = getBaseName(name)
    const siblings = groups.get(base) || []
    const sizeLabel = extractSizeLabel(name)
    return {
      ...product,
      sizeLabel,
      sizeVariants: siblings.length > 1 ? siblings : [],
    }
  })
}
