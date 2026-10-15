import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS,
  PAYMENT_METHOD_IDS,
  sanitizeSettings,
  mergeSettings,
  publicSettings,
  enabledPaymentMethods,
} from '../src/utils/siteSettingsRules.js'

describe('siteSettingsRules: sanitizeSettings', () => {
  test('empty patch is valid and writes nothing', () => {
    const r = sanitizeSettings({})
    assert.equal(r.ok, true)
    assert.deepEqual(r.values, {})
  })

  test('unknown keys are dropped, never written', () => {
    const r = sanitizeSettings({ evil: 'drop table', store_name: 'Woof' })
    assert.equal(r.ok, true)
    assert.deepEqual(r.values, { store_name: 'Woof' })
  })

  test('trims text and rejects over-long values', () => {
    const ok = sanitizeSettings({ store_name: '  Whiskers  ' })
    assert.equal(ok.values.store_name, 'Whiskers')
    const bad = sanitizeSettings({ tagline: 'x'.repeat(161) })
    assert.equal(bad.ok, false)
  })

  test('logo accepts site paths and http(s) only', () => {
    assert.equal(sanitizeSettings({ logo_url: '/logo.png' }).values.logo_url, '/logo.png')
    assert.equal(sanitizeSettings({ logo_url: 'https://x/y.png' }).values.logo_url, 'https://x/y.png')
    assert.equal(sanitizeSettings({ logo_url: 'javascript:alert(1)' }).ok, false)
  })

  test('money: rejects negatives, >2 decimals, non-numbers; threshold may be null', () => {
    assert.equal(sanitizeSettings({ shipping_fee: 0 }).values.shipping_fee, 0)
    assert.equal(sanitizeSettings({ shipping_fee: 75.25 }).values.shipping_fee, 75.25)
    assert.equal(sanitizeSettings({ shipping_fee: -1 }).ok, false)
    assert.equal(sanitizeSettings({ shipping_fee: 75.123 }).ok, false)
    assert.equal(sanitizeSettings({ shipping_fee: 'abc' }).ok, false)
    assert.equal(sanitizeSettings({ free_shipping_threshold: null }).values.free_shipping_threshold, null)
    assert.equal(sanitizeSettings({ free_shipping_threshold: 500 }).values.free_shipping_threshold, 500)
  })

  test('payment methods: canonical ids only, no dups, returned in canonical order', () => {
    const r = sanitizeSettings({
      payment_methods: [
        { id: 'cod', label: 'Cash on delivery', enabled: false, instructions: 'Keep change ready' },
        { id: 'gcash' },
      ],
    })
    assert.equal(r.ok, true)
    // only the submitted methods come back (in canonical order); mergeSettings
    // is what fills the untouched built-ins
    assert.deepEqual(r.values.payment_methods.map((m) => m.id), ['gcash', 'cod'])
    const cod = r.values.payment_methods.find((m) => m.id === 'cod')
    assert.equal(cod.enabled, false)
    assert.equal(cod.label, 'Cash on delivery')
    assert.equal(sanitizeSettings({ payment_methods: [{ id: 'bitcoin' }] }).ok, false)
    assert.equal(
      sanitizeSettings({ payment_methods: [{ id: 'gcash' }, { id: 'gcash' }] }).ok,
      false,
    )
  })

  test('maintenance is coerced to {enabled, message}', () => {
    const r = sanitizeSettings({ maintenance: { enabled: 1, message: ' Back soon ' } })
    assert.deepEqual(r.values.maintenance, { enabled: true, message: 'Back soon' })
    assert.equal(sanitizeSettings({ maintenance: 'yes' }).ok, false)
  })

  test('thresholds floor to ints and cap', () => {
    assert.equal(sanitizeSettings({ low_stock_threshold: 5 }).values.low_stock_threshold, 5)
    assert.equal(sanitizeSettings({ margin_warning_percent: 25.9 }).values.margin_warning_percent, 25)
    assert.equal(sanitizeSettings({ low_stock_threshold: -2 }).ok, false)
  })
})

describe('siteSettingsRules: merge + public + enabled', () => {
  test('merge fills defaults on a fresh row and applies the patch', () => {
    const merged = mergeSettings({}, { store_name: 'New Name' })
    assert.equal(merged.store_name, 'New Name')
    assert.equal(merged.shipping_fee, DEFAULT_SETTINGS.shipping_fee)
    assert.equal(merged.payment_methods.length, 3)
  })

  test('partial method patch never drops the other built-ins', () => {
    const merged = mergeSettings({}, { payment_methods: [{ id: 'gcash', enabled: false }] })
    assert.deepEqual(merged.payment_methods.map((m) => m.id), PAYMENT_METHOD_IDS)
    assert.equal(merged.payment_methods.find((m) => m.id === 'gcash').enabled, false)
    assert.equal(merged.payment_methods.find((m) => m.id === 'cod').enabled, true)
  })

  test('publicSettings keeps low_stock_threshold, strips admin-only keys, applies defaults', () => {
    const pub = publicSettings({ low_stock_threshold: 3, margin_warning_percent: 9, store_name: 'W' })
    assert.equal(pub.store_name, 'W')
    assert.equal(pub.low_stock_threshold, 3)
    assert.equal('margin_warning_percent' in pub, false)
    assert.equal(pub.shipping_fee, DEFAULT_SETTINGS.shipping_fee)
  })

  test('enabledPaymentMethods filters disabled and keeps order', () => {
    const s = { payment_methods: [{ id: 'gcash', enabled: false }, { id: 'cod', enabled: true }] }
    assert.deepEqual(enabledPaymentMethods(s).map((m) => m.id), ['cod'])
  })
})
