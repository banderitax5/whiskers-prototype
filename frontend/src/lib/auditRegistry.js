// Audit-log presentation registry: every backend `logAudit` action code gets a
// plain-language sentence, a chip category, and importance/visibility flags so
// a non-technical owner can read the Audit Logs page. A test in
// auditRegistry.test.js scans backend/src for `action: '...'` and fails if a
// new code has no entry here, so this file cannot silently rot.

import { formatPesos } from './cartLogic'

export const CATEGORIES = [
  'Products',
  'Orders',
  'Customers',
  'Payments',
  'Support',
  'Website content',
  'Settings',
  'Security',
  'Other',
]

export const CATEGORY_PILL = {
  Products: 'info',
  Orders: 'progress',
  Customers: 'info',
  Payments: 'info',
  Support: 'progress',
  'Website content': 'neutral',
  Settings: 'neutral',
  Security: 'danger',
  Other: 'neutral',
}

// ---------------------------------------------------------------- helpers --

const FIELD_LABELS = {
  store_name: 'Store name',
  tagline: 'Tagline',
  logo_url: 'Logo',
  contact_phone: 'Phone number',
  contact_email: 'Contact email',
  contact_address: 'Address',
  store_hours: 'Store hours',
  shipping_fee: 'Shipping fee',
  free_shipping_threshold: 'Free-shipping threshold',
  payment_methods: 'Payment methods',
  maintenance: 'Maintenance mode',
  low_stock_threshold: 'Low-stock threshold',
  margin_warning_percent: 'Margin warning level',
  price: 'Price',
  stock_quantity: 'Stock quantity',
  prod_name: 'Product name',
  category: 'Category',
  brand: 'Brand',
  image_url: 'Image',
  description: 'Description',
  details: 'Product info sections',
  cost_price: 'Cost price',
  supplier: 'Supplier',
  is_active: 'Visibility',
  archived_at: 'Archived',
  ip: 'IP address',
  user_agent: 'Device / browser',
  title: 'Title',
  subtitle: 'Subtitle',
  alt: 'Image description',
  question: 'Question',
  answer: 'Answer',
  slug: 'Page address',
  body: 'Content',
  label: 'Label',
  href: 'Link',
  placement: 'Placement',
  status: 'Status',
  type: 'Type',
  section: 'Section',
  sort_order: 'Order position',
  is_visible: 'Shown',
  starts_at: 'Starts at',
  ends_at: 'Ends at',
  button_text: 'Button text',
  link_type: 'Link type',
  link_target: 'Link destination',
  desktop_image_url: 'Desktop image',
  mobile_image_url: 'Mobile image',
  instructions: 'Instructions',
  qr_url: 'QR image',
  enabled: 'Enabled',
  name: 'Name',
  icon: 'Icon',
  type_id: 'Type',
}

export function humanizeField(field) {
  if (!field) return ''
  const key = String(field).trim()
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// never echo password/token/key-like values back into the UI
export function maskValue(label, value) {
  if (value == null) return value
  if (/password|token|secret|api.?key|private.?key/i.test(String(label || ''))) return '••••••'
  return value
}

const PLACEMENT_LABELS = {
  home_hero: 'homepage hero',
  hero: 'homepage hero',
  announcement_bar: 'announcement bar',
  promo_strip: 'promo strip',
  category_top: 'category banner',
  brand_strip: 'brand strip',
  navbar: 'main menu',
  footer_shop: 'shop footer',
  footer_account: 'account footer',
  footer_social: 'social links',
}

export function placementLabel(placement) {
  if (!placement) return 'a banner'
  return PLACEMENT_LABELS[placement] || humanizeField(placement).toLowerCase()
}

const NAV_SECTION_LABELS = {
  navbar: 'the main menu',
  footer_shop: 'the shop footer',
  footer_account: 'the account footer',
  footer_social: 'the social links',
}

export function navSectionLabel(section) {
  return NAV_SECTION_LABELS[section] || `the ${humanizeField(section || 'menu').toLowerCase()}`
}

export function sectionTypeLabel(type) {
  if (!type) return 'a home row'
  if (type === 'product_row') return 'a product row'
  if (type === 'manual') return 'a custom row'
  if (type === 'newest') return 'a newest-products row'
  if (type.startsWith('category:')) return `a ${type.slice(9)} category row`
  if (type.startsWith('brand:')) return `a ${type.slice(6)} brand row`
  return `a ${humanizeField(type).toLowerCase()} row`
}

const RESTORE_DEFAULT_AREAS = {
  site_banners: 'banners',
  site_nav_items: 'navigation links',
  site_home_sections: 'home rows',
  site_faqs: 'FAQs',
  site_policies: 'policy pages',
  site_categories: 'menu categories',
  site_settings: 'store settings',
  site_media: 'media files',
}

function restoreDefaultArea(table) {
  if (!table) return 'content'
  return RESTORE_DEFAULT_AREAS[table] || humanizeField(table).toLowerCase()
}

// parse the `details` column into a structure the UI can render. Every format
// below is produced by a logAudit call site in backend/src/routes; unknown
// shapes keep the raw text in `summary` so nothing is ever dropped.
export function parseChanges(details) {
  const out = { changes: [], fields: [], summary: null, counts: null }
  if (details == null || details === '') return out
  const text = String(details)

  let m = text.match(/^(\w[\w ]*?): '(.*)' -> '(.*)'$/)
  if (m) {
    out.changes.push({ field: m[1], from: m[2], to: m[3] })
    return out
  }

  m = text.match(/^(\w[\w ]*?) -> (.*)$/)
  if (m) {
    let to = m[2].replace(/ \(step-up verified\)$/, '')
    out.changes.push({ field: m[1], from: null, to })
    return out
  }

  m = text.match(/^updated: (.+)$/)
  if (m) {
    out.fields = m[1].split(',').map((f) => f.trim()).filter(Boolean)
    return out
  }

  m = text.match(/^changed: (.+)$/)
  if (m) {
    out.fields = m[1].split(',').map((f) => f.trim()).filter(Boolean)
    return out
  }

  m = text.match(/^created=(\d+) updated=(\d+) errors=(\d+)$/)
  if (m) {
    out.counts = { created: Number(m[1]), updated: Number(m[2]), errors: Number(m[3]) }
    return out
  }

  // bare comma-separated column list - product PATCH logs Object.keys(updates)
  // with no prefix. Only treat it as fields when every token looks like a
  // lowercase column name, so free-text summaries stay summaries.
  const SIMPLE_FIELDS = new Set([
    'price', 'category', 'brand', 'status', 'title', 'label', 'slug', 'section',
    'placement', 'type', 'enabled', 'name', 'icon', 'body', 'answer', 'question',
  ])
  const bareTokens = text.split(',').map((t) => t.trim()).filter(Boolean)
  const looksLikeFields = bareTokens.length >= 1 && bareTokens.every((t) =>
    /^[a-z][a-z0-9_]*$/.test(t) && (t.includes('_') || SIMPLE_FIELDS.has(t))
  )
  if (looksLikeFields) {
    out.fields = bareTokens
    return out
  }

  m = text.match(/^(\d+) banners reordered$/)
  if (m) {
    out.counts = { reordered: Number(m[1]) }
    return out
  }

  m = text.match(/^(\d+) sections reordered$/)
  if (m) {
    out.counts = { reordered: Number(m[1]) }
    return out
  }

  m = text.match(/^(\d+) FAQs reordered$/)
  if (m) {
    out.counts = { reordered: Number(m[1]) }
    return out
  }

  m = text.match(/^(\w+): (\d+) links reordered$/)
  if (m) {
    out.counts = { reordered: Number(m[2]), section: m[1] }
    return out
  }

  m = text.match(/^archived (\d+), restored (\d+) default rows$/)
  if (m) {
    out.counts = { archived: Number(m[1]), restored: Number(m[2]) }
    return out
  }

  m = text.match(/^(\d+) categories saved(?:, (\d+) removed)?$/)
  if (m) {
    out.counts = { saved: Number(m[1]), removed: m[2] ? Number(m[2]) : 0 }
    return out
  }

  m = text.match(/^(\S+) "(.*)" (\w+)$/)
  if (m) {
    out.createTriple = { a: m[1], name: m[2], status: m[3] }
    return out
  }

  m = text.match(/^(\S+) "(.*)"$/)
  if (m) {
    out.pair = { a: m[1], name: m[2] }
    return out
  }

  out.summary = text
  return out
}

export function parseTarget(target) {
  const raw = target == null ? '' : String(target)
  const m = raw.match(/^(product|order|payment|support|user):(.+)$/)
  if (m) return { kind: m[1], id: m[2], raw }
  return { kind: 'generic', id: null, raw }
}

const KIND_NOUN = {
  product: 'a product',
  order: 'an order',
  payment: 'a payment record',
  support: 'a support request',
  user: 'an account',
}

function shortTarget(target) {
  const t = String(target || '')
  if (!t) return 'a record'
  if (/^[0-9a-f-]{36}$/i.test(t)) return 'a record'
  return `"${t}"`
}

function quote(name, fallback) {
  if (name == null || name === '') return fallback
  return `"${name}"`
}

function statusWord(status) {
  if (!status) return 'a new status'
  return String(status).charAt(0).toUpperCase() + String(status).slice(1).toLowerCase()
}

const SETTINGS_MONEY_FIELDS = new Set([
  'shipping_fee',
  'free_shipping_threshold',
  'payment_methods',
  'maintenance',
])

const PRICE_FIELDS = new Set(['price', 'cost_price'])

// ------------------------------------------------------------- registry ----
// describe(ctx) receives:
//   who        - 'You' | display name/email | 'Someone'
//   parsed     - parseChanges(details)
//   target     - parseTarget(row.target)
//   label      - resolved product name / user name, or null
//   row        - the raw audit row
// and returns the sentence WITHOUT trailing period (added by describeEntry).

const GENERIC = {
  category: (row) => {
    const t = parseTarget(row.target)
    if (t.kind === 'product') return 'Products'
    if (t.kind === 'order') return 'Orders'
    if (t.kind === 'payment') return 'Payments'
    if (t.kind === 'support') return 'Support'
    if (t.kind === 'user') return 'Customers'
    return 'Other'
  },
  describe: ({ who, target }) => {
    const noun = KIND_NOUN[target.kind] || shortTarget(target.raw)
    return `${who} updated ${noun}`
  },
}

const PAST_VERBS = {
  create: 'created',
  add: 'added',
  update: 'updated',
  edit: 'edited',
  delete: 'deleted',
  archive: 'archived',
  restore: 'restored',
  reorder: 'reordered',
  upload: 'uploaded',
  check: 'checked',
  import: 'imported',
  save: 'saved',
  change: 'changed',
  reset: 'reset',
  mark: 'marked',
  reply: 'replied',
  record: 'recorded',
}

export const REGISTRY = {
  // ---- products ----------------------------------------------------------
  create: {
    category: 'Products',
    describe: ({ who, parsed, label }) => {
      const name = parsed.summary || label
      return `${who} created the product ${quote(name, 'a product')}`
    },
  },
  update: {
    category: 'Products',
    important: ({ parsed, changes }) => (changes
      ? 'price' in changes
      : parsed.fields.some((f) => PRICE_FIELDS.has(f))),
    describe: ({ who, parsed, label, changes }) => {
      const noun = label ? `the product "${label}"` : 'a deleted product'
      // an exact price diff (Phase B) beats the generic field list
      if (label && changes?.price?.from != null && changes?.price?.to != null) {
        return `${who} changed the price of ${noun} from ₱${formatPesos(changes.price.from)} to ₱${formatPesos(changes.price.to)}`
      }
      // the structured diff (exact changed fields) beats the details list,
      // which carries every submitted column - not only what actually changed
      const changedKeys = changes ? Object.keys(changes) : []
      const fields = (changedKeys.length ? changedKeys : parsed.fields).map(humanizeField)
      const suffix = fields.length ? ` (changed: ${fields.join(', ')})` : ''
      return `${who} updated ${noun}${suffix}`
    },
  },
  delete: {
    category: 'Products',
    important: true,
    describe: ({ who, label }) => {
      const noun = label ? `the product "${label}"` : 'a product that is no longer in the catalog'
      return `${who} deleted ${noun}`
    },
  },
  import: {
    category: 'Products',
    describe: ({ who, parsed }) => {
      const c = parsed.counts
      if (!c) return `${who} imported products`
      const parts = [`${c.created} created`, `${c.updated} updated`]
      if (c.errors) parts.push(`${c.errors} had errors`)
      return `${who} imported products (${parts.join(', ')})`
    },
  },
  image_upload: {
    category: 'Website content',
    describe: ({ who, target }) => `${who} uploaded the image ${shortTarget(target.raw)}`,
  },
  image_delete: {
    category: 'Website content',
    important: true,
    describe: ({ who, target }) => `${who} deleted the image ${shortTarget(target.raw)}`,
  },

  // ---- orders / payments / support ---------------------------------------
  status: {
    category: (row) => {
      const t = parseTarget(row.target)
      if (t.kind === 'order') return 'Orders'
      if (t.kind === 'support') return 'Support'
      return 'Other'
    },
    describe: ({ who, parsed, target, changes }) => {
      if (target.kind === 'support') return `${who} replied to a support request`
      const to = changes?.status?.to != null
        ? statusWord(changes.status.to)
        : (parsed.changes[0] ? statusWord(parsed.changes[0].to) : 'a new status')
      const from = changes?.status?.from != null ? ` from ${statusWord(changes.status.from)}` : ''
      return `${who} changed an order's status${from} to ${to}`
    },
  },

  // ---- customers / security ----------------------------------------------
  role_change: {
    category: 'Customers',
    important: true,
    describe: ({ who, parsed, label, changes }) => {
      const change = parsed.changes[0]
      const role = changes?.role?.to ?? (change ? change.to : 'a new role')
      const from = changes?.role?.from != null ? ` from ${changes.role.from}` : ''
      const whose = label ? `of "${label}"` : 'of an account'
      return `${who} changed the role ${whose}${from} to ${role}`
    },
  },
  user_delete: {
    category: 'Customers',
    important: true,
    describe: ({ who, label }) => {
      const who2 = label ? `the account of "${label}"` : 'an account'
      return `${who} deleted ${who2}`
    },
  },
  stepup_verified: {
    category: 'Security',
    hidden: true,
    describe: ({ who }) => `${who} confirmed a password before making changes`,
  },
  stepup_failed: {
    category: 'Security',
    hidden: true,
    important: true,
    describe: ({ who }) => `${who} entered a wrong password at a confirmation prompt`,
  },
  sign_in: {
    category: 'Security',
    important: true,
    describe: ({ who, changes }) => {
      // changes store { from: null, to } pairs (sanitizeChanges contract);
      // tolerate a bare scalar too so hand-built rows still read correctly
      const raw = changes?.ip
      const ip = raw && typeof raw === 'object' ? raw.to : raw
      return `${who} signed in to the admin panel${ip ? ` from ${ip}` : ''}`
    },
  },

  // ---- media library -----------------------------------------------------
  media_upload: {
    category: 'Website content',
    describe: ({ who, target }) => `${who} uploaded "${target.raw}" to the media library`,
  },
  media_update: {
    category: 'Website content',
    describe: ({ who }) => `${who} updated the description of a media file`,
  },
  media_archive: {
    category: 'Website content',
    describe: ({ who, target }) => `${who} archived the media file "${target.raw}"`,
  },
  media_restore: {
    category: 'Website content',
    describe: ({ who, target }) => `${who} restored the media file "${target.raw}"`,
  },
  media_check_broken: {
    category: 'Website content',
    describe: ({ who, target }) => `${who} checked "${target.raw}" and found it broken`,
  },

  // ---- banners -----------------------------------------------------------
  banner_create: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.createTriple
      if (!t) return `${who} created a banner`
      const suffix = t.status && t.status !== 'published' ? `, ${t.status}` : ''
      return `${who} created the "${t.name}" banner (${placementLabel(t.a)}${suffix})`
    },
  },
  banner_update: {
    category: 'Website content',
    describe: ({ who }) => `${who} updated a banner`,
  },
  banner_archive: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} archived a banner`
      return `${who} archived the "${t.name}" banner (${placementLabel(t.a)})`
    },
  },
  banner_restore: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const place = parsed.summary || 'banner'
      return `${who} restored a ${placementLabel(place)} banner`
    },
  },
  banner_reorder: {
    category: 'Website content',
    describe: ({ who, parsed, target }) => {
      const n = parsed.counts?.reordered
      const where = target.raw ? ` in the ${placementLabel(target.raw)}` : ''
      return `${who} reordered ${n != null ? `${n} banners` : 'the banners'}${where}`
    },
  },

  // ---- home sections -----------------------------------------------------
  section_create: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.createTriple
      if (!t) return `${who} created a home row`
      const suffix = t.status && t.status !== 'published' ? `, ${t.status}` : ''
      return `${who} created the "${t.name}" home row (${sectionTypeLabel(t.a)}${suffix})`
    },
  },
  section_update: {
    category: 'Website content',
    describe: ({ who }) => `${who} updated a home row`,
  },
  section_archive: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} archived a home row`
      return `${who} archived the "${t.name}" home row`
    },
  },
  section_restore: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const type = parsed.summary || 'product_row'
      return `${who} restored ${sectionTypeLabel(type)}`
    },
  },
  section_reorder: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const n = parsed.counts?.reordered
      return `${who} reordered the home page rows${n != null ? ` (${n} rows)` : ''}`
    },
  },

  // ---- navigation links --------------------------------------------------
  nav_create: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} added a navigation link`
      return `${who} added the "${t.name}" link to ${navSectionLabel(t.a)}`
    },
  },
  nav_update: {
    category: 'Website content',
    describe: ({ who }) => `${who} updated a navigation link`,
  },
  nav_archive: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} archived a navigation link`
      return `${who} archived the "${t.name}" link`
    },
  },
  nav_restore: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} restored a navigation link`
      return `${who} restored the "${t.name}" link`
    },
  },
  nav_reorder: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const n = parsed.counts?.reordered
      const section = parsed.counts?.section
      const where = section ? ` in ${navSectionLabel(section)}` : ''
      return `${who} reordered ${n != null ? `${n} links` : 'navigation links'}${where}`
    },
  },

  // ---- categories / restore defaults --------------------------------------
  category_batch_save: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const c = parsed.counts
      if (!c) return `${who} saved the menu category list`
      const removed = c.removed ? `, ${c.removed} removed` : ''
      return `${who} saved the menu category list (${c.saved} kept${removed})`
    },
  },
  content_restore_defaults: {
    category: 'Website content',
    describe: ({ who, parsed, target }) => {
      const [table] = String(target.raw || '').split(':')
      const area = restoreDefaultArea(table)
      const c = parsed.counts
      if (!c) return `${who} reset ${area} back to the built-in content`
      const parts = []
      if (c.archived) parts.push(`${c.archived} archived`)
      if (c.restored) parts.push(`${c.restored} restored`)
      return `${who} reset ${area} to the built-in content (${parts.join(', ')})`
    },
  },

  // ---- FAQs ---------------------------------------------------------------
  faq_create: {
    category: 'Website content',
    describe: ({ who, parsed }) => `${who} added the FAQ ${quote(parsed.summary, 'item')}`,
  },
  faq_update: {
    category: 'Website content',
    describe: ({ who }) => `${who} updated an FAQ`,
  },
  faq_archive: {
    category: 'Website content',
    describe: ({ who, parsed }) => `${who} archived the FAQ ${quote(parsed.summary, 'item')}`,
  },
  faq_restore: {
    category: 'Website content',
    describe: ({ who, parsed }) => `${who} restored the FAQ ${quote(parsed.summary, 'item')}`,
  },
  faq_reorder: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const n = parsed.counts?.reordered
      return `${who} reordered the FAQ list${n != null ? ` (${n} items)` : ''}`
    },
  },

  // ---- policy pages --------------------------------------------------------
  policy_create: {
    category: 'Website content',
    describe: ({ who, parsed }) => `${who} created the policy page ${quote(parsed.summary, 'item')}`,
  },
  policy_update: {
    category: 'Website content',
    describe: ({ who }) => `${who} updated a policy page`,
  },
  policy_archive: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} archived a policy page`
      return `${who} archived the policy page "${t.name}"`
    },
  },
  policy_restore: {
    category: 'Website content',
    describe: ({ who, parsed }) => {
      const t = parsed.pair
      if (!t) return `${who} restored a policy page`
      return `${who} restored the policy page "${t.name}"`
    },
  },

  // ---- promos --------------------------------------------------------------
  promo_create: {
    category: 'Products',
    describe: ({ who, target }) => `${who} created the promo code "${target.raw}"`,
  },
  promo_update: {
    category: 'Products',
    describe: ({ who, target }) => `${who} updated the promo code "${target.raw}"`,
  },
  promo_delete: {
    category: 'Products',
    important: true,
    describe: ({ who, target }) => `${who} deleted the promo code "${target.raw}"`,
  },

  // ---- store settings ------------------------------------------------------
  settings_update: {
    category: 'Settings',
    // the PATCH submits every visible field, so both the sentence and the
    // important flag must come from the diff - not from the submitted list
    important: ({ parsed, changes }) => {
      const changedKeys = changes ? Object.keys(changes) : []
      const list = changedKeys.length ? changedKeys : parsed.fields
      return list.some((f) => SETTINGS_MONEY_FIELDS.has(f))
    },
    describe: ({ who, parsed, changes }) => {
      const changedKeys = changes ? Object.keys(changes) : []
      const source = changedKeys.length ? changedKeys : parsed.fields
      if (!source.length) return `${who} updated the store settings`
      const fields = source.map(humanizeField)
      return `${who} updated the store settings: ${fields.join(', ')}`
    },
  },
}

// generic fallback for create/update/delete/status on unknown targets and for
// any future action code that has no registry entry yet (never crash, never
// show a raw uuid as the whole sentence)
const GENERIC_VERB_ACTIONS = new Set(['create', 'update', 'delete', 'status'])

function genericDescribe({ who, action, target }) {
  const verb = PAST_VERBS[action] || humanizeField(action).toLowerCase()
  const noun = KIND_NOUN[target.kind] || shortTarget(target.raw)
  return `${who} ${verb} ${noun}`
}

// structured { field: { from, to } } map recorded by the Phase B backend;
// null when absent/empty so describes can test truthily
function normalizeChanges(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return Object.keys(raw).length > 0 ? raw : null
}

// Entry row shape consumed by the Audit Logs page:
// { sentence, category, important, hidden, parsed, target, row }
export function describeEntry(row, ctx = {}) {
  const who = ctx.who || 'Someone'
  const parsed = parseChanges(row.details)
  const target = parseTarget(row.target)
  const changes = normalizeChanges(row.changes)
  const base = { who, parsed, target, label: ctx.label ?? null, row, changes }
  const entry = REGISTRY[row.action]
  const category = entry
    ? (typeof entry.category === 'function' ? entry.category(row) : entry.category)
    : (GENERIC.category(row))
  const important = entry
    ? (typeof entry.important === 'function' ? entry.important(base) : Boolean(entry.important))
    : false
  const sentence = entry
    ? entry.describe(base)
    : (GENERIC_VERB_ACTIONS.has(row.action)
      ? genericDescribe({ who, action: row.action, target })
      : `${who} performed ${humanizeField(row.action || 'an action')} (${shortTarget(target.raw)})`)
  return {
    sentence: `${sentence}.`,
    category,
    important,
    hidden: Boolean(entry?.hidden),
    parsed,
    target,
    who,
    row,
  }
}
