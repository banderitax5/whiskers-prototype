// Spreadsheet import/export helpers for the product admin page.
// Pure functions (no React, no fetch) so they unit-test cleanly.
//
// Import contract: a CSV with a header row. Required columns are
// prod_name and category; optional: prod_id (updates an existing product),
// brand, price, stock_quantity, is_active, image_url, description,
// details (JSON array of {label, content}). Header names are matched
// case-insensitively with common aliases (name, product, stock, id...).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── parser ────────────────────────────────────────────────────────────────
// RFC 4180-ish: quoted cells may contain commas, quotes (""-escaped) and
// newlines; CRLF/LF/CR all end a record. Returns { header, rows, error }.
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '')
  if (!src.trim()) return { error: 'The file is empty' }

  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const pushCell = () => { row.push(cell); cell = '' }
  const pushRow = () => { pushCell(); rows.push(row); row = [] }

  while (i < src.length) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') { inQuotes = true; i++; continue }
    if (ch === ',') { pushCell(); i++; continue }
    if (ch === '\r') { pushRow(); i += src[i + 1] === '\n' ? 2 : 1; continue }
    if (ch === '\n') { pushRow(); i++; continue }
    cell += ch
    i++
  }
  if (inQuotes) return { error: 'A quoted cell was never closed - check for a stray " in the file.' }
  if (cell !== '' || row.length) pushRow()

  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (nonEmpty.length < 2) return { error: 'The file needs a header row and at least one product row.' }
  const [header, ...data] = nonEmpty
  return { header: header.map((h) => String(h).trim()), rows: data }
}

// ── header mapping ────────────────────────────────────────────────────────
function normalizeHeader(h) {
  return String(h).trim().toLowerCase().replace(/[\s-]+/g, '_')
}

const HEADER_ALIASES = {
  prod_id: 'prod_id', product_id: 'prod_id', id: 'prod_id',
  prod_name: 'prod_name', name: 'prod_name', product: 'prod_name', product_name: 'prod_name',
  category: 'category',
  brand: 'brand',
  price: 'price',
  stock_quantity: 'stock_quantity', stock: 'stock_quantity',
  is_active: 'is_active', active: 'is_active', status: 'is_active',
  image_url: 'image_url', image: 'image_url',
  description: 'description',
  details: 'details',
  cost_price: 'cost_price', cost: 'cost_price',
  supplier: 'supplier',
}

// ── cell coercion ─────────────────────────────────────────────────────────
// spreadsheets love "PHP 1,299.00" - strip the noise, keep the number
function toMoney(value) {
  const cleaned = String(value ?? '').replace(/php|₱/gi, '').replace(/,/g, '').trim()
  if (cleaned === '') return { error: 'Price is required' }
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return { error: 'Price must be a number of 0 or more' }
  return { value: n }
}

function toStock(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').trim()
  if (cleaned === '') return { value: 0 }
  const n = Number(cleaned)
  if (!Number.isInteger(n) || n < 0) return { error: 'Stock must be a whole number of 0 or more' }
  return { value: n }
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'y', 'active'])
const FALSE_WORDS = new Set(['false', '0', 'no', 'n', 'hidden'])

function toActive(value) {
  const s = String(value ?? '').trim().toLowerCase()
  if (s === '') return { value: true }
  if (TRUE_WORDS.has(s)) return { value: true }
  if (FALSE_WORDS.has(s)) return { value: false }
  return { error: 'Active must be true/false, yes/no, or 1/0' }
}

function toDetails(value) {
  const s = String(value ?? '').trim()
  if (s === '') return { value: null }
  let parsed
  try { parsed = JSON.parse(s) } catch { return { error: 'Details must be valid JSON (export a product to see the format)' } }
  if (!Array.isArray(parsed)) return { error: 'Details must be a JSON array of {label, content} sections' }
  return { value: parsed }
}

// ── row validation ────────────────────────────────────────────────────────
// maps one parsed CSV row to a product body. Returns { error } or { value }.
export function csvRowToProduct(cells, header) {
  const raw = {}
  header.forEach((h, idx) => {
    const key = HEADER_ALIASES[normalizeHeader(h)]
    if (key && raw[key] === undefined) raw[key] = cells[idx] ?? ''
  })

  const prodName = String(raw.prod_name ?? '').trim()
  if (!prodName) return { error: 'Product name is required' }
  if (prodName.length > 200) return { error: 'Product name must be 200 characters or fewer' }
  const category = String(raw.category ?? '').trim()
  if (!category) return { error: 'Category is required' }
  if (category.length > 120) return { error: 'Category must be 120 characters or fewer' }

  const price = toMoney(raw.price)
  if (price.error) return { error: price.error }
  const stock = toStock(raw.stock_quantity)
  if (stock.error) return { error: stock.error }
  const active = toActive(raw.is_active)
  if (active.error) return { error: active.error }
  const details = toDetails(raw.details)
  if (details.error) return { error: details.error }

  const prodId = String(raw.prod_id ?? '').trim()
  if (prodId && !UUID_RE.test(prodId)) return { error: 'ID must be a product ID from the export (a long xxxx-xxxx code)' }

  const value = {
    prod_name: prodName,
    category,
    price: price.value,
    stock_quantity: stock.value,
    is_active: active.value,
    brand: String(raw.brand ?? '').trim() || null,
    image_url: String(raw.image_url ?? '').trim() || null,
    description: String(raw.description ?? '').trim() || null,
    details: details.value,
  }
  if (prodId) value.prod_id = prodId
  const cost = String(raw.cost_price ?? '').trim()
  if (cost !== '') {
    const c = toMoney(cost)
    if (c.error) return { error: `Cost: ${c.error.toLowerCase()}` }
    value.cost_price = c.value
  }
  const supplier = String(raw.supplier ?? '').trim()
  if (supplier) value.supplier = supplier
  return { value }
}

// validates every data row. Returns { rows, errors, updateCount, newCount }.
// errors are {row: <1-based line in the data>, message}; invalid rows are
// excluded from `rows` so the preview and the import batch match.
export function csvToProducts(parsed) {
  if (parsed.error) return { rows: [], errors: [{ row: 0, message: parsed.error }], updateCount: 0, newCount: 0 }
  const rows = []
  const errors = []
  let updateCount = 0
  parsed.rows.forEach((cells, idx) => {
    const result = csvRowToProduct(cells, parsed.header)
    if (result.error) errors.push({ row: idx + 1, message: result.error })
    else {
      rows.push(result.value)
      if (result.value.prod_id) updateCount++
    }
  })
  return { rows, errors, updateCount, newCount: rows.length - updateCount }
}

// ── template ──────────────────────────────────────────────────────────────
// one-click starter file so the owner never has to guess the column names
export function importTemplateCsv() {
  const header = 'prod_name,category,brand,price,stock_quantity,is_active,image_url,description'
  const sample = 'Example Dog Bed,DOGS,HappyPaws,450.50,12,true,https://example.com/img.jpg,Soft washable dog bed'
  return `${header}\r\n${sample}\r\n`
}

// split validated rows into batches that stay under the backend's 100kb
// json body limit (~60KB of payload per request, 200-row server cap)
export function batchRows(rows, { maxBytes = 60000, maxRows = 200 } = {}) {
  const batches = []
  let current = []
  let bytes = 2 // [] overhead
  for (const row of rows) {
    const size = JSON.stringify(row).length + 1
    if (current.length && (current.length >= maxRows || bytes + size > maxBytes)) {
      batches.push(current)
      current = []
      bytes = 2
    }
    current.push(row)
    bytes += size
  }
  if (current.length) batches.push(current)
  return batches
}
