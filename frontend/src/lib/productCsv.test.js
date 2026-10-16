import { describe, it, expect } from 'vitest'
import { parseCsv, csvToProducts, csvRowToProduct, batchRows, importTemplateCsv } from './productCsv.js'

describe('parseCsv', () => {
  it('parses a simple file with CRLF endings', () => {
    const out = parseCsv('name,price\r\nDog Toy,150\r\nCat Toy,99\r\n')
    expect(out.header).toEqual(['name', 'price'])
    expect(out.rows).toEqual([['Dog Toy', '150'], ['Cat Toy', '99']])
  })

  it('handles quoted cells with commas, escaped quotes and newlines', () => {
    const out = parseCsv('name,note\r\n"A, B","say ""hi""\nsecond line"\r\n')
    expect(out.rows).toEqual([['A, B', 'say "hi"\nsecond line']])
  })

  it('strips a BOM and ignores fully empty lines', () => {
    const out = parseCsv('\uFEFFname,price\n\nDog,10\n\n')
    expect(out.header).toEqual(['name', 'price'])
    expect(out.rows).toEqual([['Dog', '10']])
  })

  it('rejects empty files, header-only files and unclosed quotes', () => {
    expect(parseCsv('').error).toMatch(/empty/)
    expect(parseCsv('name,price').error).toMatch(/at least one/)
    expect(parseCsv('a,b\r\n"broken,c\r\n').error).toMatch(/never closed/)
  })
})

describe('csvToProducts', () => {
  const header = ['name', 'category', 'brand', 'price', 'stock', 'active']

  it('maps aliases (name/stock/active) and validates rows', () => {
    const out = csvToProducts({
      header,
      rows: [
        ['Dog Toy', 'TOYS', 'HappyPaws', 'PHP 150.50', '10', 'yes'],
        ['', 'TOYS', '', '5', '1', 'true'], // missing name
        ['Cat Toy', '', 'X', '5', '1', 'true'], // missing category
        ['Bird Toy', 'TOYS', 'X', 'free', '1', 'true'], // bad price
        ['Fish Toy', 'TOYS', 'X', '5', '1.5', 'true'], // fractional stock
        ['Hamster Toy', 'TOYS', 'X', '5', '1', 'maybe'], // bad active
      ],
    })
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]).toMatchObject({
      prod_name: 'Dog Toy',
      category: 'TOYS',
      brand: 'HappyPaws',
      price: 150.5,
      stock_quantity: 10,
      is_active: true,
    })
    expect(out.errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6])
    expect(out.newCount).toBe(1)
    expect(out.updateCount).toBe(0)
  })

  it('treats rows with a prod_id as updates; rejects malformed ids', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    const parsed = {
      header: ['id', 'name', 'category', 'price', 'stock'],
      rows: [[id, 'Dog Toy', 'TOYS', '150', '5'], ['not-a-uuid', 'Cat Toy', 'TOYS', '99', '5']],
    }
    const out = csvToProducts(parsed)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].prod_id).toBe(id)
    expect(out.updateCount).toBe(1)
    expect(out.errors[0]).toMatchObject({ row: 2 })
  })

  it('parses details JSON and rejects invalid JSON', () => {
    const good = csvRowToProduct(
      ['Dog', 'DOGS', '', '10', '1', '', '', '', '[{"label":"Size","content":"M"}]'],
      ['name', 'category', 'brand', 'price', 'stock', 'active', 'image', 'description', 'details'],
    )
    expect(good.value.details).toEqual([{ label: 'Size', content: 'M' }])
    const bad = csvRowToProduct(
      ['Dog', 'DOGS', '', '10', '1', '', '', '', 'not-json'],
      ['name', 'category', 'brand', 'price', 'stock', 'active', 'image', 'description', 'details'],
    )
    expect(bad.error).toMatch(/valid JSON/)
  })

  it('accepts comma-formatted prices and hidden status', () => {
    const out = csvToProducts({
      header: ['name', 'category', 'price', 'stock', 'status'],
      rows: [['Big Bag', 'DOGS', '1,299.00', '3', 'hidden']],
    })
    expect(out.rows[0].price).toBe(1299)
    expect(out.rows[0].is_active).toBe(false)
  })

  it('passes through the error for a broken file', () => {
    const out = csvToProducts({ error: 'The file is empty' })
    expect(out.errors[0].message).toBe('The file is empty')
  })
})

describe('batchRows', () => {
  it('splits rows by size so each batch stays under the limit', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      prod_name: `Product ${i}`,
      category: 'DOGS',
      price: i,
      stock_quantity: 1,
      description: 'x'.repeat(1000),
    }))
    const batches = batchRows(rows, { maxBytes: 5000, maxRows: 200 })
    expect(batches.length).toBeGreaterThan(1)
    batches.forEach((batch) => {
      expect(JSON.stringify(batch).length).toBeLessThanOrEqual(5000)
    })
    expect(batches.flat()).toEqual(rows)
  })

  it('respects the row cap and keeps a single small row intact', () => {
    expect(batchRows([{ a: 1 }])).toEqual([[{ a: 1 }]])
    const rows = Array.from({ length: 5 }, () => ({ a: 1 }))
    const batches = batchRows(rows, { maxRows: 2 })
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1])
  })
})

describe('importTemplateCsv', () => {
  it('produces a header row and one example', () => {
    const out = importTemplateCsv()
    const lines = out.trim().split('\r\n')
    expect(lines[0]).toContain('prod_name')
    expect(lines[0]).toContain('category')
    expect(lines).toHaveLength(2)
  })
})
