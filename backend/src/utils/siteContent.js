// Content resolution for the storefront: which rows are visible right now,
// in what order, with what shape. Pure functions, no I/O, so the storefront's
// fallback behaviour and the admin's scheduling rules are unit-testable.

// sections/banners/nav rows use these statuses; a row is visible when it is
// published (or its schedule says a scheduled row's window has arrived) and
// the window has not ended
export const STATUSES = ['draft', 'published', 'scheduled'];

export function isInWindow(row, now = new Date()) {
  if (row?.starts_at) {
    const start = new Date(row.starts_at);
    if (Number.isNaN(start.getTime())) return true;
    if (start > now) return false;
  }
  if (row?.ends_at) {
    const end = new Date(row.ends_at);
    if (Number.isNaN(end.getTime())) return true;
    if (end < now) return false;
  }
  return true;
}

export function isVisible(row, now = new Date()) {
  if (!row) return false;
  if (row.archived_at) return false; // soft-deleted rows never show
  if (row.status === 'published') return isInWindow(row, now);
  if (row.status === 'scheduled') return isInWindow(row, now);
  return false; // draft: never customer-visible
}

export function visibleRows(rows, now = new Date()) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => !r.archived_at && isVisible(r, now))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

// section builders: the storefront asks for sections by type because each
// block type renders differently on the home page
export function visibleSections(sections, now = new Date()) {
  return visibleRows(sections, now);
}

export function bannersFor(placement, banners, now = new Date()) {
  const wanted = Array.isArray(placement) ? placement : [placement]
  return visibleRows(banners, now).filter((b) => wanted.includes(b.placement))
}

// link targets are internal paths only or absolute http(s). Anything else
// (javascript:, data:, protocol-relative //evil.com) is dropped to "#"
export function safeHref(linkType, linkTarget) {
  const target = String(linkTarget || '').trim();
  if (!target) return '#';
  if (linkType === 'url') {
    if (/^https?:\/\//i.test(target)) return target;
    return '#';
  }
  if (linkType === 'product') return target ? `/products/${encodeURIComponent(target)}` : '#';
  if (linkType === 'category') {
    if (!target) return '#';
    if (/^https?:\/\//i.test(target)) return '#';
    return `/menu?category=${encodeURIComponent(target)}`;
  }
  if (linkType === 'promo') return '/menu';
  return '#';
}

// resolves a section's link using the same rules as banner links
export function sectionLink(section) {
  if (!section) return '#';
  const cfg = section.config || {};
  return safeHref(cfg.link_type || 'none', cfg.link_target || '');
}

// product row sections can be a manual pick list (product ids) or a rule
// ("best_sellers_30d", "newest", "on_sale", "category:<name>", "brand:<name>")
export function parseRule(config) {
  const raw = String(config?.rule || 'manual').trim();
  if (raw === 'manual' || raw === '') return { kind: 'manual' };
  const [head, ...rest] = raw.split(':');
  if ((head === 'category' || head === 'brand') && rest.length > 0) {
    return { kind: head, value: rest.join(':') };
  }
  if (['best_sellers_30d', 'newest', 'on_sale'].includes(head)) {
    return { kind: head };
  }
  return { kind: 'manual' };
}

// reorders rows from a drag-and-drop payload: the payload is the list of ids
// in their new order; rows not mentioned keep their relative order at the end.
// returns a Map(id -> new sort_order)
export function reorderMap(ids) {
  const map = new Map();
  if (!Array.isArray(ids)) return map;
  ids.forEach((id, idx) => {
    if (id != null) map.set(String(id), idx);
  });
  return map;
}

// applies a reorder map onto existing rows, preserving unmentioned rows in
// ascending sort_order after the mapped ones
export function applyReorder(rows, ids) {
  if (!Array.isArray(rows)) return [];
  const map = reorderMap(ids);
  const mentioned = rows
    .filter((r) => map.has(String(r.id)))
    .sort((a, b) => map.get(String(a.id)) - map.get(String(b.id)));
  const rest = rows
    .filter((r) => !map.has(String(r.id)))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const next = [...mentioned, ...rest];
  return next.map((row, idx) => ({ ...row, sort_order: idx }));
}

// minimum shape a published section must have before the storefront renders
// it; anything malformed is skipped rather than crashing the page
export function isValidSection(section) {
  if (!section || typeof section !== 'object') return false;
  if (!STATUSES.includes(section.status)) return false;
  if (!section.type) return false;
  if (section.type === 'product_row') {
    const rule = parseRule(section.config);
    if (rule.kind === 'manual' && !Array.isArray(section.config?.product_ids)) return false;
  }
  return true;
}
