# Product Admin Self-Service — Deliverables Audit

**Date:** 2026-10-16 · **Branch:** `capstone/p1-p2-fixes` · **Status:** audit only, no code changed

Checked all 20 requested items against the running system. Every verdict cites the
file and line that proves it. "Partial" means the core exists but a named part of
the request does not.

**Legend:** ✅ Done · ⚠️ Partial · ❌ Missing

---

## 1. Description and details fields ✅ (one gap: weight/size)

| Ask | Status | Evidence |
|---|---|---|
| Description box | ✅ Done | `product.description` column; textarea in both desktop and mobile product forms (`AdminProductManagement.jsx` L541–L590, L863+) |
| Simple formatting (bold/bullets) | ✅ Done | `lib/productInfo.js` `formatContent` renders paragraphs, bullet lists, pipe tables; shown via `ProductInfoAccordion` on the product page |
| Ingredients | ✅ Done | fixed "Ingredients" section in the details accordion group |
| Optional fields — brand | ✅ Done | brand input added in the per-tab fixes phase (`AdminProductManagement.jsx` L547) |
| Optional fields — weight/size | ⚠️ Partial | no dedicated field; only a free-text line inside the Product Info section |

## 2. Stock and status in the form ✅

`stock_quantity` number input (min 0) at `AdminProductManagement.jsx` L550; Active/Hidden
toggle at L624 (`is_active`); table badges ACTIVE / HIDDEN / OUT / ARCHIVED at L467.

## 3. Category management ⚠️

- ✅ **Manage Categories screen exists** — `AdminNavigation.jsx` Categories tab: add, relabel, reorder, hide from the filter list, remove override-only rows
- ❌ **Category is free text in the product form** (`AdminProductManagement.jsx` L541) — typos create duplicate categories
- ⚠️ **Delete is limited by design**: categories are derived from live product rows; the save is upsert-only, so a category in use can be hidden/relabelled but not deleted (`navRules.js` `sanitizeCategoryBatch`, `admin.js` L2137)
- The stray "TEST" category can be hidden today from the Categories tab; deleting it needs the product rows re-categorised first

## 4. Confirm before delete + undo ✅

Archive (soft delete) with `ConfirmDialog`, Restore from archive, 409 when the
product has order history (FK backstop, `admin.js` L661–L683); every archive is
audit-logged and captured in change history.

## 5. Inline validation and friendly errors ⚠️

| Ask | Status | Evidence |
|---|---|---|
| Price validation | ✅ Done | `Number.isFinite(x) >= 0` + trim in the form (`AdminProductManagement.jsx` submit path); backend `sanitizeProductPatch` |
| "Price is 0" warning | ❌ Missing | 0 is a valid saved price (414 of 465 products are unpriced); nothing warns the owner that the storefront will block checkout and show "Price not yet set" |
| "Name already exists" | ❌ Missing | no duplicate `prod_name` check on create/update (contrast: policies L2515 and promos L2694 *do* return 409) |
| "Image too large" | ✅ Done | client-side pre-check + friendly inline `role="alert"` message and static "JPG, PNG, WebP or GIF · up to 5 MB" hint on both desktop and mobile forms (`AdminProductManagement.jsx` `imageFileProblem`/`friendlyImageError`); server 5MB cap unchanged |

## 6. Bulk actions ❌

Deliberately not built for products: the table is server-paginated, and bulk
price/status edits were judged business-risk in the Phase 5 review. Checkboxes +
bulk actions exist today only on the four *content* pages (Media, Banners, Home
Sections, Navigation — `components/adminBulk.jsx`).

## 7. CSV/Excel import and export ❌

Nothing anywhere in the repo (grep for csv/xlsx returns zero hits).

## 8. Duplicate product ❌

Action row is Edit / ±stock / price history / archive / delete only
(`AdminProductManagement.jsx` L461–L476).

## 9. Multiple images per product ❌ — **disregarded by owner (2026-10-19)**

One `image_url` column, whitelisted in `adminInput.js` L92. The admin Media
Library (`AdminMedia`) exists for uploads but is not wired as a per-product
gallery; no drag-to-reorder, no "main image" concept.

## 10. Low-stock alerts ⚠️

- ✅ **Global threshold** — owner-editable `low_stock_threshold`, now serving both
  the admin Low Stock stat and the storefront "Only N left" chips (Gap A work)
- ❌ **Per-product threshold** — no such column
- ✅ **Dashboard warning** — Low Stock stat card on the products page

## 11. Custom fields ⚠️

- ✅ **Storage is ready**: `product.details` jsonb accepts *any* `{label, content}`
  pairs — the backend has no label whitelist, up to 12 sections
  (`utils/productDetails.js` `sanitizeDetails`)
- ❌ **The form only offers 5 fixed labels** (`SECTION_LABELS` in `lib/productInfo.js`,
  mapped at `AdminProductManagement.jsx` L599/L872)

Making labels owner-defined is a **UI-only change** — no migration needed.

## 12. Variants (size/weight with own price + stock) ❌ — **disregarded by owner (2026-10-19)**

No variant model. Products that differ only by size exist as separate rows (e.g.
1kg/5kg/10kg), which the Quick View groups for display only
(`extractSizeLabel` in `lib/productUtils.js`). True variants need a schema change
plus cart/checkout work.

## 13. Discounts and promotions ✅

Full promo engine (Phase 4): percent / fixed / free-shipping, sitewide /
category / product scope, min subtotal, cap, usage + per-user limits, date
windows, admin CRUD, auto-apply at checkout, and storefront "Sale −N%" badges
(`utils/promoEngine.js`, `AdminPromos.jsx`, `lib/promoDisplay.js`).

## 14. Tags and featured flags ⚠️

No tag or featured columns (`adminInput.js` L92 whitelist). Equivalents exist:
"Featured on homepage" = Home Sections manual product row; "New arrival" = the
`newest` rule; "Best seller" = analytics report only (no home-section rule).

## 15. SEO fields ⚠️

Client-side meta title/description/OG tags are generated automatically from the
product (`lib/seo.js` `setProductSeo`, restored on unmount). There are no
owner-editable fields: no slug (URLs use `prod_id`), no meta title, no meta
description. Note the SPA also cannot serve per-product meta to crawbers —
already a logged paper discrepancy (Q4).

## 16. Scheduled publishing for products ❌

Products have only `is_active`. Banners and Home Sections *do* have draft +
scheduled states with a preview mode — the product table was never given the
same treatment.

## 17. Change history + "Restore previous version" ⚠️

- ✅ **Selling-price history** with a visual before/after diff (`GET
  /api/admin/products/:id/price-history`, dialog in the products page)
- ✅ **Archive/restore** of whole products
- ❌ **Full field-level diff for every edit** and a restore button — price history
  is the only per-field trail

## 18. Draft mode (save unpublished product) ❌

`is_active: false` hides a product; there is no separate draft state. (Banners /
Sections have one.)

## 19. Role permissions ⚠️

- ✅ Admin-only today: cost/supplier/margin fields, archive/delete lifecycle,
  settings, promos, content, customers, audit logs (`lib/permissions.js`)
- ✅ Staff: manage products/orders/support/payments
- ❌ **The requested split does not exist**: staff can currently edit *price* on
  existing products (documented in `permissions.js` L38 — "staff edit
  text/images/price/stock"). Making price owner-only is a new rule.

## 20. In-app help ⚠️

13 native icon-button tooltips (`title=`) and per-field hints on the Settings and
Navigation pages. No guide page, no first-run onboarding, no "?" explanations on
the product form.

---

## Summary

| Status | Items |
|---|---|
| ✅ Done (9) | 1 (minus weight/size), 2, 4, 13, and parts of 3/5/10/11/14/15/17/20 |
| ⚠️ Partial (8) | 1 (weight/size), 3 (form dropdown), 5 (name dup / zero-price), 10 (per-product), 11 (owner labels), 14, 15, 17 (full diff), 19 (price lock), 20 |
| ❌ Missing (6) | 6 bulk actions, 7 CSV, 8 duplicate, 9 multi-image, 12 variants, 16 scheduled, 18 draft |

*Counts overlap because several items are split.*

### Paper traceability
Objective C (Chapter I) commits to a CMS that modifies "product listings,
pricing, availability, and promotional deals" and Figure 3.2.11 is Product
Management. Items **1–5, 13** trace to that objective. Items **6–12, 14–20** are
owner-requested extensions beyond the paper and should be recorded as such (or
added to the paper's scope) before they're built.

### Suggested build order if approved (no schema change first)
1. **#3b** category dropdown in the product form (kills typo duplicates) — UI only
2. **#8** duplicate product — UI only
3. **#5** name-uniqueness 409 + "this product has no price" warning — UI + tiny backend check
4. **#11** owner-defined section labels in the details form — UI only
5. **#7** CSV **export** (read-only, safe) then import with preview
6. **#6** bulk actions on the products table
7. **#20** help/tooltips pass

### Needs an owner decision (schema + flow changes)
- **#10 per-product threshold** — Option A: one nullable `product.low_stock_threshold` column (null = inherit global); recommended, awaiting yes/no
- **#16/#18 draft + scheduled** — new product states (mirror the banner/section machinery)
- **#17 full history + restore** — snapshot table
- **#1 weight/size** — keep the free-text line in Product Info (no change) vs a dedicated field (needs a column)

### Disregarded by owner (2026-10-19)
- **#9 multi-image** — no build
- **#12 variants** — planned then dropped by owner; design notes live in the session log only
