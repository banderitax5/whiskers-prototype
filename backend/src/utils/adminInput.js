// pure input sanitizers for admin product writes and list queries.
// kept out of the route file so they can be unit-tested without Express.

export const MAX_PRICE_PHP = 10_000_000
const MAX_NAME = 200
const MAX_CATEGORY = 120
const MAX_BRAND = 120
const MAX_URL = 1000

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : null
}

// validates a product payload for create. returns { error } or { value }
// where value is the exact column map to insert.
export function sanitizeProductCreate(body) {
  const prod_name = asTrimmedString(body?.prod_name)
  const category = asTrimmedString(body?.category)
  if (!prod_name || !category || body?.price == null) {
    return { error: 'prod_name, category, and price are required' }
  }
  if (prod_name.length > MAX_NAME) return { error: `Product name must be ${MAX_NAME} characters or fewer` }
  if (category.length > MAX_CATEGORY) return { error: `Category must be ${MAX_CATEGORY} characters or fewer` }

  if (typeof body.price === 'boolean') {
    return { error: 'Price must be a number' }
  }
  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE_PHP) {
    return { error: `Price must be a number between 0 and ${MAX_PRICE_PHP.toLocaleString('en-US')}` }
  }

  const stock = typeof body.stock_quantity === 'boolean' ? NaN : Number(body.stock_quantity ?? 0)
  if (!Number.isInteger(stock) || stock < 0) {
    return { error: 'Stock quantity must be a whole number of 0 or more' }
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    return { error: 'Visibility must be Active or Hidden' }
  }

  const brand = asTrimmedString(body.brand)
  if (brand && brand.length > MAX_BRAND) return { error: `Brand must be ${MAX_BRAND} characters or fewer` }

  if (body.description != null && typeof body.description !== 'string') {
    return { error: 'Description must be text' }
  }
  if (body.image_url != null && typeof body.image_url !== 'string') {
    return { error: 'Image URL must be text' }
  }

  return {
    value: {
      prod_name,
      category,
      brand: brand || null,
      price,
      stock_quantity: stock,
      is_active: body.is_active ?? true,
      image_url: body.image_url ? String(body.image_url).trim().slice(0, MAX_URL) || null : null,
      description: body.description ? body.description.trim().slice(0, 2000) : null,
    },
  }
}

// validates a partial product update. returns { error } or { updates }.
// `details` is passed through untouched here; the route runs sanitizeDetails.
export function sanitizeProductPatch(body) {
  const allowed = ['prod_name', 'category', 'brand', 'price', 'stock_quantity', 'image_url', 'is_active', 'description', 'details']
  const updates = {}
  for (const key of allowed) {
    if (body?.[key] !== undefined) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return { error: 'No updatable fields provided' }
  }

  if ('prod_name' in updates) {
    const name = asTrimmedString(updates.prod_name)
    if (!name) return { error: 'Product name cannot be empty' }
    if (name.length > MAX_NAME) return { error: `Product name must be ${MAX_NAME} characters or fewer` }
    updates.prod_name = name
  }
  if ('category' in updates) {
    const category = asTrimmedString(updates.category)
    if (!category) return { error: 'Category cannot be empty' }
    if (category.length > MAX_CATEGORY) return { error: `Category must be ${MAX_CATEGORY} characters or fewer` }
    updates.category = category
  }
  if ('brand' in updates) {
    if (updates.brand === null) {
      updates.brand = null
    } else {
      const brand = asTrimmedString(updates.brand)
      if (!brand) updates.brand = null
      else if (brand.length > MAX_BRAND) return { error: `Brand must be ${MAX_BRAND} characters or fewer` }
      else updates.brand = brand
    }
  }
  if ('price' in updates) {
    if (typeof updates.price === 'boolean') {
      return { error: 'Price must be a number' }
    }
    const price = Number(updates.price)
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE_PHP) {
      return { error: `Price must be a number between 0 and ${MAX_PRICE_PHP.toLocaleString('en-US')}` }
    }
    updates.price = price
  }
  if ('stock_quantity' in updates) {
    const stock = typeof updates.stock_quantity === 'boolean' ? NaN : Number(updates.stock_quantity)
    if (!Number.isInteger(stock) || stock < 0) {
      return { error: 'Stock quantity must be a whole number of 0 or more' }
    }
    updates.stock_quantity = stock
  }
  if ('is_active' in updates && typeof updates.is_active !== 'boolean') {
    return { error: 'Visibility must be Active or Hidden' }
  }
  if ('image_url' in updates) {
    if (updates.image_url === null) updates.image_url = null
    else if (typeof updates.image_url !== 'string') return { error: 'Image URL must be text' }
    else updates.image_url = updates.image_url.trim().slice(0, MAX_URL) || null
  }
  if ('description' in updates) {
    if (updates.description !== null && typeof updates.description !== 'string') {
      return { error: 'Description must be text' }
    }
    updates.description = updates.description ? updates.description.trim().slice(0, 2000) : null
  }
  return { updates }
}

// whitelist of sort keys the admin product list accepts from the client.
const PRODUCT_SORTS = {
  newest: { column: 'created_at', ascending: false },
  name_asc: { column: 'prod_name', ascending: true },
  name_desc: { column: 'prod_name', ascending: false },
  price_asc: { column: 'price', ascending: true },
  price_desc: { column: 'price', ascending: false },
  stock_asc: { column: 'stock_quantity', ascending: true },
  stock_desc: { column: 'stock_quantity', ascending: false },
}

// parses ?q=&category=&brand=&active=&sort= for the admin product list.
// pagination parsing stays with the route's parsePagination.
export function parseProductListQuery(query) {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  const category = typeof query.category === 'string' ? query.category.trim().slice(0, 120) : ''
  const brand = typeof query.brand === 'string' ? query.brand.trim().slice(0, 120) : ''
  let active = null
  if (query.active === 'true' || query.active === 'false') active = query.active === 'true'
  const sort = PRODUCT_SORTS[query.sort] || PRODUCT_SORTS.newest
  return { q, category, brand, active, sort }
}

// escapes ILIKE wildcards so a user-typed % cannot turn into match-everything
export function escapeLike(value) {
  return String(value).replace(/[%_]/g, '\\$&')
}
