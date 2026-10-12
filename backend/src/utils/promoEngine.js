// Promo validation and application logic.
// Pure functions — no DB, no I/O. Testable in isolation.

export const PROMO_TYPES = ['percent', 'fixed', 'free_shipping'];
export const PROMO_SCOPES = ['sitewide', 'category', 'product'];

/**
 * @typedef {Object} PromoRow
 * @property {string} code
 * @property {string} type - 'percent' | 'fixed' | 'free_shipping'
 * @property {number} value
 * @property {string} scope - 'sitewide' | 'category' | 'product'
 * @property {string|null} target_id
 * @property {number} min_subtotal
 * @property {number|null} max_discount
 * @property {number|null} usage_limit
 * @property {number} usage_count
 * @property {number} per_user_limit
 * @property {string} starts_at
 * @property {string|null} ends_at
 * @property {boolean} is_active
 */

/**
 * @typedef {Object} CartItem
 * @property {string} product_id
 * @property {number} quantity
 * @property {number} unit_price
 * @property {number} subtotal
 * @property {string|null} [category]
 * @property {string|null} [brand]
 */

/**
 * @typedef {Object} PromoCheckResult
 * @property {boolean} ok
 * @property {PromoRow} [promo]
 * @property {string} [error]
 * @property {number} [discountAmount]
 * @property {Map<string,number>} [lineDiscounts]
 * @property {number} [shippingDiscount]
 */

function isWindowValid(promo) {
  const now = new Date();
  const start = new Date(promo.starts_at);
  if (start > now) return false;
  if (promo.ends_at) {
    const end = new Date(promo.ends_at);
    if (end < now) return false;
  }
  return promo.is_active;
}

function scopeMatches(promo, items) {
  if (promo.scope === 'sitewide') return true;
  if (promo.scope === 'category' && promo.target_id) {
    return items.some(i => i.category === promo.target_id);
  }
  if (promo.scope === 'product' && promo.target_id) {
    return items.some(i => i.product_id === promo.target_id);
  }
  return false;
}

function subtotalMeetsMin(promo, subtotal) {
  return subtotal >= promo.min_subtotal;
}

function usageOk(promo) {
  if (promo.usage_limit !== null && promo.usage_count >= promo.usage_limit) return false;
  return true;
}

function calcLineDiscounts(promo, items) {
  const discounts = new Map();
  const applicableItems = items.filter(i => {
    if (promo.scope === 'sitewide') return true;
    if (promo.scope === 'category' && promo.target_id) return i.category === promo.target_id;
    if (promo.scope === 'product' && promo.target_id) return i.product_id === promo.target_id;
    return false;
  });

  if (applicableItems.length === 0) return discounts;

  if (promo.type === 'percent') {
    for (const item of applicableItems) {
      const disc = Math.round(item.subtotal * promo.value / 100 * 100) / 100;
      discounts.set(item.product_id, disc);
    }
  } else if (promo.type === 'fixed') {
    // spread fixed value proportionally across applicable item subtotals
    const totalApplicableSubtotal = applicableItems.reduce((s, i) => s + i.subtotal, 0);
    let remaining = promo.value;
    for (let i = 0; i < applicableItems.length; i++) {
      const item = applicableItems[i];
      let disc = 0;
      if (i === applicableItems.length - 1) {
        disc = remaining;
      } else {
        disc = Math.round(item.subtotal / totalApplicableSubtotal * promo.value * 100) / 100;
      }
      disc = Math.min(disc, item.subtotal); // never exceed item total
      discounts.set(item.product_id, disc);
      remaining -= disc;
    }
  }
  // free_shipping: no line discounts, handled separately
  return discounts;
}

function applyMaxDiscountCap(promo, lineDiscounts) {
  if (promo.max_discount === null) return lineDiscounts;
  let total = 0;
  for (const d of lineDiscounts.values()) total += d;
  if (total <= promo.max_discount) return lineDiscounts;
  // scale down proportionally
  const factor = promo.max_discount / total;
  const capped = new Map();
  for (const [k, v] of lineDiscounts.entries()) {
    capped.set(k, Math.round(v * factor * 100) / 100);
  }
  return capped;
}

export function validatePromo(promo, items, userId, userUsageCount) {
  if (!promo) return { ok: false, error: 'Invalid promo code.' };
  if (!isWindowValid(promo)) return { ok: false, error: 'Promo code has expired or is not yet active.' };
  if (!scopeMatches(promo, items)) return { ok: false, error: 'Promo code not applicable to items in your cart.' };
  if (!subtotalMeetsMin(promo, items.reduce((s, i) => s + i.subtotal, 0))) {
    return { ok: false, error: `Minimum subtotal of ₱${promo.min_subtotal.toFixed(2)} required.` };
  }
  if (!usageOk(promo)) return { ok: false, error: 'Promo code usage limit reached.' };
  if (userUsageCount >= promo.per_user_limit) {
    return { ok: false, error: `You have already used this promo code ${promo.per_user_limit} time(s).` };
  }

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const lineDiscounts = calcLineDiscounts(promo, items);
  const cappedDiscounts = applyMaxDiscountCap(promo, lineDiscounts);
  let totalDiscount = 0;
  for (const d of cappedDiscounts.values()) totalDiscount += d;

  let shippingDiscount = 0;
  if (promo.type === 'free_shipping') {
    shippingDiscount = 75; // SHIPPING_FEE_PHP from shopRules
    totalDiscount += shippingDiscount;
  }

  return {
    ok: true,
    promo,
    discountAmount: totalDiscount,
    lineDiscounts: cappedDiscounts,
    shippingDiscount,
  };
}

// Helper to compute per-line discount_amount for order_details insert
export function buildDiscountAmounts(items, lineDiscounts) {
  const result = new Map();
  for (const item of items) {
    const disc = lineDiscounts.get(item.product_id) || 0;
    // spread per-unit
    const qty = Math.max(1, item.quantity);
    const perUnit = Math.round(disc / qty * 100) / 100;
    result.set(item.product_id, perUnit);
  }
  return result;
}