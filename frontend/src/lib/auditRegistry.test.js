import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REGISTRY, describeEntry, humanizeField, maskValue, parseChanges, parseTarget,
} from './auditRegistry.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const backendSrc = path.resolve(here, '../../../backend/src')

function collectJsFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectJsFiles(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

describe('registry completeness (scans backend logAudit call sites)', () => {
  it('has an entry for every action code used in backend/src', () => {
    const files = collectJsFiles(backendSrc)
    expect(files.length).toBeGreaterThan(5)
    const found = new Set()
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      for (const m of src.matchAll(/action:\s*'([a-z0-9_]+)'/g)) found.add(m[1])
    }
    // sanity: the backend really does log the codes we think it does
    expect(found.size).toBeGreaterThanOrEqual(40)
    expect(found.has('settings_update')).toBe(true)
    expect(found.has('stepup_failed')).toBe(true)
    const missing = [...found].filter((code) => !REGISTRY[code])
    expect(missing, `unregistered audit actions: ${missing.join(', ')}`).toEqual([])
  })
})

describe('parseChanges', () => {
  it('parses a before/after pair', () => {
    const p = parseChanges("alt: 'Blue dog' -> 'Red cat'")
    expect(p.changes).toEqual([{ field: 'alt', from: 'Blue dog', to: 'Red cat' }])
  })

  it('parses a single arrow and strips the step-up suffix', () => {
    const p = parseChanges('role -> staff (step-up verified)')
    expect(p.changes).toEqual([{ field: 'role', from: null, to: 'staff' }])
  })

  it('parses updated:/changed: field lists', () => {
    expect(parseChanges('updated: store_name, shipping_fee').fields).toEqual(['store_name', 'shipping_fee'])
    expect(parseChanges('changed: alt, title').fields).toEqual(['alt', 'title'])
  })

  it('parses import counts and reorder counts', () => {
    expect(parseChanges('created=3 updated=1 errors=0').counts).toEqual({ created: 3, updated: 1, errors: 0 })
    expect(parseChanges('5 banners reordered').counts).toEqual({ reordered: 5 })
    expect(parseChanges('navbar: 7 links reordered').counts).toEqual({ reordered: 7, section: 'navbar' })
    expect(parseChanges('13 categories saved, 2 removed').counts).toEqual({ saved: 13, removed: 2 })
  })

  it('parses create triples and pairs', () => {
    expect(parseChanges('hero "Blue banner" published').createTriple).toEqual({ a: 'hero', name: 'Blue banner', status: 'published' })
    expect(parseChanges('site_banners:hero').pair).toBeUndefined()
    expect(parseChanges('hero "Blue banner"').pair).toEqual({ a: 'hero', name: 'Blue banner' })
  })

  it('keeps unknown shapes as summary and handles null', () => {
    expect(parseChanges('Test Policy').summary).toBe('Test Policy')
    expect(parseChanges(null)).toEqual({ changes: [], fields: [], summary: null, counts: null })
  })
})

describe('parseTarget', () => {
  it('splits prefixed kinds', () => {
    expect(parseTarget('product:abc')).toEqual({ kind: 'product', id: 'abc', raw: 'product:abc' })
    expect(parseTarget('user:u-1').kind).toBe('user')
  })

  it('treats slugs and raw strings as generic', () => {
    expect(parseTarget('refund-policy').kind).toBe('generic')
    expect(parseTarget(null).raw).toBe('')
  })
})

describe('humanizeField / maskValue', () => {
  it('uses the label map and falls back to title case', () => {
    expect(humanizeField('store_name')).toBe('Store name')
    expect(humanizeField('shipping_fee')).toBe('Shipping fee')
    expect(humanizeField('some_new_field')).toBe('Some New Field')
    expect(humanizeField('')).toBe('')
  })

  it('masks secret-like values', () => {
    expect(maskValue('api_key', 'sk-123')).toBe('••••••')
    expect(maskValue('password', 'hunter2')).toBe('••••••')
    expect(maskValue('store_name', 'Whiskers')).toBe('Whiskers')
  })
})

describe('describeEntry sentences (owner-facing examples)', () => {
  const who = 'You'

  it('settings update with money fields is important', () => {
    const e = describeEntry(
      { action: 'settings_update', target: 'site_settings', details: 'updated: store_name, tagline, contact_phone, contact_email', admin_email: 'x' },
      { who }
    )
    expect(e.sentence).toBe('You updated the store settings: Store name, Tagline, Phone number, Contact email.')
    expect(e.category).toBe('Settings')
    expect(e.important).toBe(false)
  })

  it('marks shipping/payment settings updates important', () => {
    const e = describeEntry(
      { action: 'settings_update', target: 'site_settings', details: 'updated: shipping_fee, payment_methods' },
      { who }
    )
    expect(e.important).toBe(true)
  })

  it('category batch save reads as a plain sentence', () => {
    const e = describeEntry(
      { action: 'category_batch_save', target: 'site_categories', details: '13 categories saved' },
      { who }
    )
    expect(e.sentence).toBe('You saved the menu category list (13 kept).')
    expect(e.category).toBe('Website content')
  })

  it('policy create uses the title, not the slug', () => {
    const e = describeEntry(
      { action: 'policy_create', target: 'test-policy', details: 'Test Policy' },
      { who }
    )
    expect(e.sentence).toBe('You created the policy page "Test Policy".')
  })

  it('step-up entries are hidden security rows', () => {
    const failed = describeEntry(
      { action: 'stepup_failed', target: 'user:u1' },
      { who }
    )
    expect(failed.hidden).toBe(true)
    expect(failed.category).toBe('Security')
    expect(failed.important).toBe(true)
    const ok = describeEntry({ action: 'stepup_verified', target: 'user:u1' }, { who })
    expect(ok.hidden).toBe(true)
    expect(ok.important).toBe(false)
  })

  it('product create uses the logged product name', () => {
    const e = describeEntry(
      { action: 'create', target: 'product:p1', details: 'Royal Canin Adult 10kg' },
      { who }
    )
    expect(e.sentence).toBe('You created the product "Royal Canin Adult 10kg".')
  })

  it('product update falls back to "a deleted product" and flags price changes', () => {
    const e = describeEntry(
      { action: 'update', target: 'product:pone', details: 'price, stock_quantity' },
      { who, label: null }
    )
    expect(e.sentence).toBe('You updated a deleted product (changed: Price, Stock quantity).')
    expect(e.important).toBe(true)
    const withLabel = describeEntry(
      { action: 'update', target: 'product:p1', details: 'price' },
      { who, label: 'Royal Canin Adult 10kg' }
    )
    expect(withLabel.sentence).toBe('You updated the product "Royal Canin Adult 10kg" (changed: Price).')
  })

  it('product delete is important and handles missing labels', () => {
    const e = describeEntry({ action: 'delete', target: 'product:p1' }, { who, label: null })
    expect(e.sentence).toBe('You deleted a product that is no longer in the catalog.')
    expect(e.important).toBe(true)
    const named = describeEntry({ action: 'delete', target: 'product:p1' }, { who, label: 'Treats' })
    expect(named.sentence).toBe('You deleted the product "Treats".')
  })

  it('order status and support reply sentences', () => {
    const order = describeEntry(
      { action: 'status', target: 'order:o1', details: 'status -> Shipped' },
      { who }
    )
    expect(order.sentence).toBe("You changed an order's status to Shipped.")
    expect(order.category).toBe('Orders')
    const support = describeEntry(
      { action: 'status', target: 'support:s1', details: 'support reply sent' },
      { who }
    )
    expect(support.sentence).toBe('You replied to a support request.')
    expect(support.category).toBe('Support')
  })

  it('role change and user delete use resolved names', () => {
    const role = describeEntry(
      { action: 'role_change', target: 'user:u1', details: 'role -> admin (step-up verified)' },
      { who, label: 'Juan Dela Cruz' }
    )
    expect(role.sentence).toBe('You changed the role of "Juan Dela Cruz" to admin.')
    expect(role.important).toBe(true)
    const del = describeEntry(
      { action: 'user_delete', target: 'user:u1', details: 'account removed (step-up verified)' },
      { who, label: null }
    )
    expect(del.sentence).toBe('You deleted an account.')
  })

  it('banner create/archive/reorder read with placement names', () => {
    const create = describeEntry(
      { action: 'banner_create', target: 'b1', details: 'hero "Blue banner" draft' },
      { who }
    )
    expect(create.sentence).toBe('You created the "Blue banner" banner (homepage hero, draft).')
    const archive = describeEntry(
      { action: 'banner_archive', target: 'b1', details: 'announcement_bar "Sale"' },
      { who }
    )
    expect(archive.sentence).toBe('You archived the "Sale" banner (announcement bar).')
    const reorder = describeEntry(
      { action: 'banner_reorder', target: 'hero', details: '3 banners reordered' },
      { who }
    )
    expect(reorder.sentence).toBe('You reordered 3 banners in the homepage hero.')
  })

  it('nav create/reorder reads with section names', () => {
    const create = describeEntry(
      { action: 'nav_create', target: 'n1', details: 'navbar "About us"' },
      { who }
    )
    expect(create.sentence).toBe('You added the "About us" link to the main menu.')
    const reorder = describeEntry(
      { action: 'nav_reorder', target: 'site_nav_items', details: 'footer_shop: 4 links reordered' },
      { who }
    )
    expect(reorder.sentence).toBe('You reordered 4 links in the shop footer.')
  })

  it('media alt update shows the change; missing names degrade honestly', () => {
    const update = describeEntry(
      { action: 'media_update', target: 'm1', details: "alt: 'a' -> 'b'" },
      { who }
    )
    expect(update.sentence).toBe('You updated the description of a media file.')
    expect(update.parsed.changes[0]).toEqual({ field: 'alt', from: 'a', to: 'b' })
    const unknown = describeEntry(
      { action: 'media_doodad', target: 'uploads/x.png' },
      { who }
    )
    expect(unknown.sentence).toBe('You performed Media Doodad ("uploads/x.png").')
  })

  it('non-admin actor uses the email; missing email says Someone', () => {
    const e = describeEntry(
      { action: 'faq_create', target: 'f1', details: 'How do I track my order?' },
      { who: 'staff@example.com' }
    )
    expect(e.sentence).toBe('staff@example.com added the FAQ "How do I track my order?".')
    const nobody = describeEntry({ action: 'faq_create', target: 'f1', details: 'Q' }, { who: 'Someone' })
    expect(nobody.sentence).toBe('Someone added the FAQ "Q".')
  })

  it('never crashes on empty rows', () => {
    const e = describeEntry({}, { who: 'You' })
    expect(e.sentence).toContain('You')
    expect(e.category).toBe('Other')
  })
})

describe('describeEntry with structured changes (Phase B)', () => {
  const who = 'You'

  it('product price sentence quotes exact pesos and stays important', () => {
    const e = describeEntry(
      {
        action: 'update',
        target: 'product:p1',
        details: 'price',
        changes: { price: { from: 265, to: 299 } },
      },
      { who, label: 'Royal Canin Adult 10kg' }
    )
    expect(e.sentence).toBe('You changed the price of the product "Royal Canin Adult 10kg" from ₱265.00 to ₱299.00.')
    expect(e.important).toBe(true)
  })

  it('product update without a price change keeps the field-list sentence', () => {
    const e = describeEntry(
      {
        action: 'update',
        target: 'product:p1',
        details: 'stock_quantity',
        changes: { stock_quantity: { from: 50, to: 40 } },
      },
      { who, label: 'Treats' }
    )
    expect(e.sentence).toBe('You updated the product "Treats" (changed: Stock quantity).')
  })

  it('suffix lists only diffed fields, not every column the form submitted', () => {
    // details carries Object.keys(updates) - every field the PATCH sent -
    // while changes holds only what actually differed
    const e = describeEntry(
      {
        action: 'update',
        target: 'product:p1',
        details: 'price, stock_quantity, category',
        changes: { stock_quantity: { from: 10, to: 20 } },
      },
      { who, label: 'Alpha Pro 10kg' }
    )
    expect(e.sentence).toBe('You updated the product "Alpha Pro 10kg" (changed: Stock quantity).')
  })

  it('role change quotes the previous role when recorded', () => {
    const e = describeEntry(
      {
        action: 'role_change',
        target: 'user:u1',
        details: 'role -> admin (step-up verified)',
        changes: { role: { from: 'user', to: 'admin' } },
      },
      { who, label: 'Juan Dela Cruz' }
    )
    expect(e.sentence).toBe('You changed the role of "Juan Dela Cruz" from user to admin.')
  })

  it('order status quotes the previous status when recorded', () => {
    const e = describeEntry(
      {
        action: 'status',
        target: 'order:o1',
        details: 'status -> Shipped',
        changes: { status: { from: 'Processing', to: 'Shipped' } },
      },
      { who }
    )
    expect(e.sentence).toBe("You changed an order's status from Processing to Shipped.")
  })

  it('treats an empty or malformed changes map as absent', () => {
    const empty = describeEntry(
      { action: 'status', target: 'order:o1', details: 'status -> Shipped', changes: {} },
      { who }
    )
    expect(empty.sentence).toBe("You changed an order's status to Shipped.")
    const malformed = describeEntry(
      { action: 'status', target: 'order:o1', details: 'status -> Shipped', changes: [1] },
      { who }
    )
    expect(malformed.sentence).toBe("You changed an order's status to Shipped.")
  })
})
