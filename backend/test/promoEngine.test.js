import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validatePromo, buildDiscountAmounts } from '../src/utils/promoEngine.js';

function basePromo(overrides = {}) {
  return {
    code: 'SAVE10',
    type: 'percent',
    value: 10,
    scope: 'sitewide',
    target_id: null,
    min_subtotal: 0,
    max_discount: null,
    usage_limit: null,
    usage_count: 0,
    per_user_limit: 1,
    starts_at: new Date(Date.now() - 86400000).toISOString(),
    ends_at: new Date(Date.now() + 86400000).toISOString(),
    is_active: true,
    ...overrides,
  };
}

function baseItems(overrides = []) {
  return [
    { product_id: 'p1', quantity: 2, unit_price: 100, subtotal: 200, category: 'cat1' },
    { product_id: 'p2', quantity: 1, unit_price: 300, subtotal: 300, category: 'cat2' },
    ...overrides.map((o, i) => ({ product_id: `p${i + 3}`, quantity: 1, unit_price: 100, subtotal: 100, ...o })),
  ];
}

describe('promoEngine', () => {
  test('percent sitewide applies to all lines', () => {
    const promo = basePromo({ type: 'percent', value: 10 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    assert.equal(res.lineDiscounts?.get('p1'), 20);
    assert.equal(res.lineDiscounts?.get('p2'), 30);
    assert.equal(res.discountAmount, 50);
  });

  test('percent category scope filters', () => {
    const promo = basePromo({ type: 'percent', value: 20, scope: 'category', target_id: 'cat1' });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    assert.equal(res.lineDiscounts?.get('p1'), 40);
    assert.equal(res.lineDiscounts?.get('p2'), undefined);
    assert.equal(res.discountAmount, 40);
  });

  test('percent product scope filters', () => {
    const promo = basePromo({ type: 'percent', value: 50, scope: 'product', target_id: 'p2' });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    assert.equal(res.lineDiscounts?.get('p1'), undefined);
    assert.equal(res.lineDiscounts?.get('p2'), 150);
    assert.equal(res.discountAmount, 150);
  });

  test('fixed sitewide spreads proportionally', () => {
    const promo = basePromo({ type: 'fixed', value: 100 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    assert.equal(res.lineDiscounts?.get('p1'), 40);
    assert.equal(res.lineDiscounts?.get('p2'), 60);
    assert.equal(res.discountAmount, 100);
  });

  test('fixed never exceeds line subtotal', () => {
    const promo = basePromo({ type: 'fixed', value: 500 });
    const items = baseItems([{ product_id: 'p3', quantity: 1, unit_price: 50, subtotal: 50 }]);
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    let total = 0;
    const discounts = res.lineDiscounts || new Map();
    for (const d of discounts.values()) total += d;
    assert.equal(total, 500);
    for (const item of items) {
      const d = discounts.get(item.product_id) || 0;
      assert.ok(d <= item.subtotal + 0.01);
    }
  });

  test('max_discount caps total', () => {
    const promo = basePromo({ type: 'percent', value: 50, max_discount: 100 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    assert.equal(res.discountAmount, 100);
  });

  test('free_shipping adds shipping discount', () => {
    const promo = basePromo({ type: 'free_shipping', value: 0 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, true);
    assert.equal(res.shippingDiscount, 75);
    assert.equal(res.discountAmount, 75);
    assert.equal(res.lineDiscounts?.size, 0);
  });

  test('min_subtotal enforced', () => {
    const promo = basePromo({ min_subtotal: 1000 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, false);
    assert.match(res.error || '', /Minimum subtotal/);
  });

  test('usage_limit enforced', () => {
    const promo = basePromo({ usage_limit: 5, usage_count: 5 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, false);
    assert.match(res.error || '', /usage limit reached/);
  });

  test('per_user_limit enforced', () => {
    const promo = basePromo({ per_user_limit: 2 });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 2);
    assert.equal(res.ok, false);
    assert.match(res.error || '', /already used/);
  });

  test('expired promo rejected', () => {
    const promo = basePromo({ ends_at: new Date(Date.now() - 86400000).toISOString() });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, false);
    assert.match(res.error || '', /expired/);
  });

  test('inactive promo rejected', () => {
    const promo = basePromo({ is_active: false });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, false);
    assert.match(res.error || '', /expired/);
  });

  test('not yet started promo rejected', () => {
    const promo = basePromo({ starts_at: new Date(Date.now() + 86400000).toISOString() });
    const items = baseItems();
    const res = validatePromo(promo, items, 'u1', 0);
    assert.equal(res.ok, false);
    assert.match(res.error || '', /not yet active/);
  });

  test('buildDiscountAmounts spreads per unit', () => {
    const lineDiscounts = new Map([['p1', 20], ['p2', 30]]);
    const items = baseItems();
    const perUnit = buildDiscountAmounts(items, lineDiscounts);
    assert.equal(perUnit.get('p1'), 10);
    assert.equal(perUnit.get('p2'), 30);
  });
});