import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultRowsFor, RESTORE_SCOPES, HERO_SLIDES, BRAND_TILES, NAVBAR_LINKS, FOOTER_SHOP, FOOTER_ACCOUNT, FOOTER_SOCIAL, HOME_CATEGORY_ROWS } from '../src/utils/siteContentDefaults.js'

test('unknown scope returns null', () => {
  assert.equal(defaultRowsFor('nope'), null)
  assert.equal(defaultRowsFor(undefined), null)
  assert.equal(defaultRowsFor(''), null)
})

test('RESTORE_SCOPES all resolve to a scope', () => {
  for (const scope of RESTORE_SCOPES) {
    const def = defaultRowsFor(scope)
    assert.ok(def, `scope ${scope} must resolve`)
    assert.ok(def.table.startsWith('site_'), `scope ${scope} targets a content table`)
    assert.ok(Array.isArray(def.rows) && def.rows.length > 0, `scope ${scope} has rows`)
  }
})

test('home_hero scope: 5 published slides, filtered by placement', () => {
  const def = defaultRowsFor('home_hero')
  assert.equal(def.table, 'site_banners')
  assert.deepEqual(def.filter, { column: 'placement', value: 'home_hero' })
  assert.equal(def.rows.length, HERO_SLIDES.length)
  def.rows.forEach((row, i) => {
    assert.equal(row.placement, 'home_hero')
    assert.equal(row.status, 'published')
    assert.equal(row.sort_order, i)
    assert.equal(row.link_type, 'none')
  })
})

test('brand_strip scope: brand links point at the menu with the label encoded', () => {
  const def = defaultRowsFor('brand_strip')
  assert.equal(def.table, 'site_banners')
  def.rows.forEach((row, i) => {
    assert.equal(row.placement, 'brand_strip')
    assert.equal(row.link_type, 'brand')
    assert.equal(row.status, 'published')
    assert.equal(row.sort_order, i)
  })
  assert.equal(def.rows[0].link_target, '/menu?brand=Royal%20Canin')
  assert.equal(def.rows.length, BRAND_TILES.length)
})

test('nav scopes: rows carry section, label, href, sort_order', () => {
  for (const [scope, links] of [
    ['navbar', NAVBAR_LINKS],
    ['footer_shop', FOOTER_SHOP],
    ['footer_account', FOOTER_ACCOUNT],
    ['footer_social', FOOTER_SOCIAL],
  ]) {
    const def = defaultRowsFor(scope)
    assert.equal(def.table, 'site_nav_items')
    assert.deepEqual(def.filter, { column: 'section', value: scope })
    assert.equal(def.rows.length, links.length)
    def.rows.forEach((row, i) => {
      assert.equal(row.section, scope)
      assert.equal(row.label, links[i].label)
      assert.equal(row.href, links[i].to)
      assert.equal(row.sort_order, i)
    })
  }
})

test('footer_social keeps full https hrefs (external links are allowed)', () => {
  const def = defaultRowsFor('footer_social')
  assert.ok(def.rows.every((r) => /^https:\/\//.test(r.href)))
})

test('home_sections scope: 6 draft placeholders, no category filter', () => {
  const def = defaultRowsFor('home_sections')
  assert.equal(def.table, 'site_home_sections')
  assert.equal(def.filter, null)
  assert.equal(def.rows.length, HOME_CATEGORY_ROWS)
  def.rows.forEach((row, i) => {
    assert.equal(row.type, 'product_row')
    assert.equal(row.status, 'draft')
    assert.equal(row.sort_order, i)
    assert.deepEqual(row.config, { rule: 'category', category: '' })
  })
})
