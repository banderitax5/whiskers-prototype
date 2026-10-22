import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1G19M_8kkxtffXPOTmqKN8iOfCCsXjAGU-OaJqUg8Nwg/export?format=csv'

// maps the column index to its pet category
const PET_CATEGORIES = {
  0: 'Dogs',
  2: 'Cats',
  4: 'Hamster/Guinea Pig/Rabbit',
  5: 'Birds',
  6: 'Fish',
  7: 'Reptiles',
  8: 'Pets Milk',
}

// sub-categories detected from section header rows
const DOG_SUBCATS = ['DRY', 'WET-CAN', 'WET-POUCH', 'TREATS', 'VETERINARY FOOD RECO DOG (DRY)', 'VETERINARY FOOD RECO DOG (Can)']
const CAT_SUBCATS = ['DRY', 'WET-CAN', 'WET-POUCH', 'TREATS']

// attempts to extract a brand name from the product name
function extractBrand(name) {
  const known = [
    'Royal Canin', 'Aozi', 'Pedigree', 'Whiskas', 'Ciao', 'Sheba', 'Felix',
    'Kitekat', 'Maxwell', 'Goodest', 'Doggo', 'Morando', 'Smartheart', 'Smart Heart',
    'Cindy Recipe', 'Special Cat', 'Powercat', 'Power Cat', 'Princess', 'Zoi',
    'Cuties Catz', 'Lucy Cat', 'Vitakraft', 'Jolly', 'Smartheart', 'Sunflower',
    'Mazuri', 'Aqua Master', 'Hikari', 'Okiko', 'Tetra', 'Xo King', 'Xo',
    'Optimum', 'Alpha Pro', 'Beef Pro', 'Holistic', 'Nutrichunks', 'Top Breed',
    'Vitality', 'Natures Protection', 'Chef Special', 'Royal Knight', 'Special Dog',
    'Pet One', 'Yumyum', 'Dogo', 'Bark', 'Powerdog', 'Cesar', 'Jerky Chews',
    'Vegebrand', 'Jerhigh', 'Munch & Treats', 'Calcium Milky', 'Doggie Biscuits',
    'Zert', 'Entree', 'Train And Rewards', 'Temptation', 'Temptations', 'Friskies',
    'Jinny Cat', 'Champion Treats', 'Aozi', 'Aristo', 'Feline Gourment',
    'Pet Goats', 'Ciao Can', 'Avian Plus', 'Aqua Pro', 'FurCare', 'Whiskers',
    'Melken', 'Milk Paws', 'Puppy Lab', 'Puppy Love',
  ]
  for (const b of known) {
    if (name.toLowerCase().startsWith(b.toLowerCase())) return b
  }
  return name.split(' ')[0]
}

// parses a price string like "1,050" or "920" into a number
function parsePrice(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const num = parseFloat(cleaned)
  return Number.isFinite(num) && num > 0 ? num : null
}

// fetches the CSV and parses rows
async function fetchCSV() {
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`)
  const text = await res.text()
  return text.split('\n').map(line => {
    const row = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { row.push(current.trim()); current = ''; continue }
      current += ch
    }
    row.push(current.trim())
    return row
  })
}

// walks through the CSV rows and builds a flat product list
function parseProducts(rows) {
  const products = []
  let currentCategory = ''
  let currentSubCategory = ''

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    const col0 = (row[0] || '').trim()

    // skip empty rows
    const hasAnyData = row.some((c, idx) => idx !== 1 && idx !== 3 && c && c.trim())
    if (!hasAnyData) continue

    // detect section headers (single word in col0 that is a known sub-category)
    if (col0 && !row[1] && DOG_SUBCATS.includes(col0.toUpperCase())) {
      currentSubCategory = col0
      continue
    }
    // some cat sub-category headers appear in col2
    const col2 = (row[2] || '').trim()
    if (col2 && !row[3] && CAT_SUBCATS.includes(col2.toUpperCase())) {
      // this is a cat sub-category header, skip
      continue
    }
    // veterinary header in col0
    if (col0.startsWith('VETERINARY')) {
      currentSubCategory = col0
      continue
    }

    // process each pet column
    for (const [colIdx, petType] of Object.entries(PET_CATEGORIES)) {
      const ci = parseInt(colIdx)
      const name = (row[ci] || '').trim()
      if (!name || name.length < 3) continue

      // the price column is typically the next column for dogs (col1) and cats (col3)
      let price = null
      if (ci === 0) price = parsePrice(row[1])
      else if (ci === 2) price = parsePrice(row[3])

      const category = petType === 'Dogs'
        ? `${petType} - ${currentSubCategory || 'Other'}`
        : petType

      products.push({
        prod_name: name,
        category,
        price: price || 0,
        stock_quantity: 50,
        brand: extractBrand(name),
        image_url: null,
      })
    }
  }
  return products
}

// inserts products in batches to avoid rate limits
async function insertProducts(products) {
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('product')
      .insert(batch)
      .select('prod_id')
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} failed:`, error.message)
    } else {
      inserted += data.length
      console.log(`Batch ${Math.floor(i / BATCH) + 1}: inserted ${data.length} products`)
    }
  }
  return inserted
}

async function main() {
  console.log('Fetching product data from Google Sheets...')
  const rows = await fetchCSV()
  console.log(`Parsed ${rows.length} rows from CSV`)

  const products = parseProducts(rows)
  console.log(`Found ${products.length} products to insert`)

  if (products.length === 0) {
    console.log('No products found. Check CSV format.')
    return
  }

  const inserted = await insertProducts(products)
  console.log(`Done! Inserted ${inserted} products into the product table.`)
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
