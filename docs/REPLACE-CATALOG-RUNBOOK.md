# Replace the Whiskers product catalog — 2026-10-29

This runbook replaces the current 465-product catalog with the 1,023 cleaned
rows from the Google Sheet. It deletes all orders and product-linked rows,
because every replacement product gets a new ID.

**Nothing has been deleted or imported. The SQL files are not run automatically.**

**Decisions locked in (2026-10-29):**

- **Category:** main-only, 8 categories. Subcategory is prepared for later in
  `docs/SUBCATEGORY-UPGRADE-PLAN.md`; it is **not** applied now.
- **Stock:** blank stock set to **10**. Existing `5` and `50` values are kept.
  That gives 741 rows at 10, 186 at 5, and 96 at 50. The zero-stock count after
  import is **0**.

---

## Files

| File | What it does |
|---|---|
| `docs/whiskers-import-ready-2026-10-29.csv` | The upload file for **Admin → Products → Import**. 1,023 rows, blank stock set to 10, validated with the app's own CSV parser. |
| `docs/sql/01_preflight.sql` | Read-only: row counts, foreign keys, promos, stale category/nav links, duplicate names. |
| `docs/sql/02_backup.sql` | Copies every table that will be deleted or edited into a `backup` schema. |
| `docs/sql/03_wipe.sql` | Destructive: deletes orders/cart/recommendation/review/price-history/products in dependency order, inside one transaction. |
| `docs/sql/04_import_via_sql_optional.sql` | Optional direct SQL insert of the 1,023 rows. Skip if you use the Admin importer. |
| `docs/sql/05_post_import.sql` | Replaces `site_categories`, hides dead nav links, deactivates `SAVE100`, drafts the Bark banner, and runs verification. |
| `docs/sql/00_optional_add_subcategory.sql` | Prepared only: adds the `subcategory` column when you decide to use it. |
| `docs/sql/06_backfill_subcategory_optional.sql` | Prepared only: fills subcategory on the imported products by exact name. |
| `docs/whiskers-import-ready-with-subcategory-2026-10-29.csv` | Prepared only: the same products with a `subcategory` column. |
| `docs/SUBCATEGORY-UPGRADE-PLAN.md` | Prepared only: the DB/API/CSV/Menu changes needed for subcategory filtering. |
| `docs/whiskers-catalog-import-review-2026-10-29.xlsx` | Full review workbook: Products, Needs Review, Category Map, DB matches, DB Only, etc. |
| `docs/whiskers-needs-review-2026-10-29.csv` | The 48 excluded rows, extracted from the workbook. |
| `docs/whiskers-db-only-2026-10-29.csv` | The 311 current DB products that are not in the new sheet. |

---

## What gets deleted and what stays

### Deleted

| Table | Rows now |
|---|---:|
| `product` | 465 |
| `product_price_history` | 7 |
| `cart_items` | 14 |
| `orders` | 42 |
| `order_details` | 64 |
| `payment` | 40 |
| `promo_usage` | 1 |
| `sales` | 0 |
| `feedback` | 2 |
| `recommendation` | 32 |

### Kept

`profiles`, `supports`, `supports_messages`, `site_*` content, `site_banners`,
`site_banner_events`, `audit_logs`, `data_analytics`, `events`, `promos`
(the promo itself is kept, but `SAVE100` is deactivated).

> **Confirm decision 9 below.** The wipe deletes *all* orders, not only orders
> linked to deleted products. If you need to keep order history, stop here —
> the plan has to change to "archive old products" instead of "delete them".

---

## Decisions

### 1. Category model — main-only (chosen)

**Chosen: A. Main category only.** 8 categories:

| Category | Imported rows |
|---|---:|
| Cats | 383 |
| Dogs | 307 |
| Fish | 72 |
| Birds | 5 |
| Small Pets | 8 |
| Reptiles | 2 |
| Health & Wellness | 111 |
| Grooming & Hygiene | 135 |
| **Total** | **1,023** |

Works with the current app and the built-in CSV importer. The subcategory
mapping stays in the workbook for later.

**Prepared for later: B. Add `subcategory`.** The assets are ready but not
applied:

1. `docs/sql/00_optional_add_subcategory.sql` — adds the column.
2. `docs/whiskers-import-ready-with-subcategory-2026-10-29.csv` — the same
   1,023 products with a `subcategory` column.
3. `docs/sql/06_backfill_subcategory_optional.sql` — fills the column on the
   imported products by exact name.
4. `docs/SUBCATEGORY-UPGRADE-PLAN.md` — the API/Menu/admin changes needed to
   actually filter by it.

The Menu currently filters only by `category`; the column alone gives you a
flat "Dogs" list with the subcategory sitting unused. **Do not run `00` or
`06` until you are ready to ship the filter UI.** The main-only import does
not need them.

**Do not add the column unless you are also shipping the filter.** A column
that the CSV importer and the Menu both ignore is worse than no column: it
looks like the data is stored, but the storefront cannot use it.

---

### 2. Stock — default 10 (chosen)

**Chosen: B. Set a default of 10 for blank stock.**

| Original stock | Rows | Imported stock |
|---|---:|---:|
| Blank | 741 | 10 |
| 5 | 186 | 5 |
| 50 | 96 | 50 |

All 1,023 products are buyable and recommendable immediately. The 741 tens are
placeholders; reconcile them in Admin → Products when you count.

This avoids the flat-0 problem:

- Menu / product cards disable "Add to cart" at 0.
- Checkout rejects 0-stock lines.
- The recommendation engine only considers price > 0 and stock > 0.

If you would rather use a different default, tell me before the import and I
will regenerate the CSV/SQL.

---

### 3. The 48 excluded rows

1,071 sheet rows − 48 flagged = **1,023**. The 48 are in
`docs/whiskers-needs-review-2026-10-29.csv` and the workbook's **Needs Review**
tab:

- **36** have no usable price (35 blank + 1 blank duplicate)
- **6** have a price range instead of one price
- **7** are duplicate-name extras (one of them is also in the no-price group)

| Option | Result |
|---|---|
| **A. Import 1,023 now, fix the 48 later** | Fast; the 48 are absent until added. |
| **B. Fix the 48 first** | Complete catalog; delays the import. |

**Recommendation:** A if the 48 are low priority. B for the 6 range-priced
items and any high-value products. Note that the 36 no-price rows include
29 Hikari fish foods; they may simply be unavailable.

---

### 4. Descriptions — all 1,023 are blank

| Option | Result |
|---|---|
| **A. Import blank (recommended)** | Product pages show no description. |
| **B. Write descriptions for top sellers after import** | Better conversion, manual work. |
| **C. Fix `GROQ_API_KEY` and generate AI drafts** | Automated, but currently blocked: the key in `backend/.env` is invalid (Groq returns 401 `invalid_api_key`). |

**Recommendation:** A now, B/C later. The AI draft feature stays broken until
the key is replaced and the backend is restarted.

---

### 5. Images — 45 rows have none

| Option | Result |
|---|---|
| **A. Accept the placeholder (recommended)** | Some cards have no photo. |
| **B. Fill the 45 before import** | Better storefront; manual work. |

---

### 6. Brands — 31 rows have none

| Option | Result |
|---|---|
| **A. Accept (recommended)** | Those products do not appear in the brand filter. |
| **B. Fill from packaging** | Better filtering; manual work. |

---

### 7. Promo `SAVE100`

It is an active product-scoped promo targeting `Alpha Pro 10kg`
(`da4785e9-24ca-4707-98e5-4abedb02419b`). That product is **DB-only** and is
not in the new sheet, so the promo will point at nothing after the wipe.

| Option | Result |
|---|---|
| **A. Deactivate (recommended)** | Keeps the promo record/history; no broken offer. `05_post_import.sql` does this. |
| **B. Delete** | Removes it entirely. |
| **C. Recreate for a new product** | Do it after the import, using the new product's ID. |

`PALIMOS200` is inactive and sitewide; it is unaffected.

---

### 8. Site categories, nav, and banners

After a main-only import, the storefront has 8 categories, but
`site_categories` still contains 12 old strings (`Dogs - DRY`, `Dogs - TREATS`,
`Pets Milk`, …). The navbar also has:

- **Dry Food** → `/menu?category=Dogs - DRY`
- **Wet Food** → `/menu?category=Wet Food`

Both become dead links. The published **Bark** brand banner also points at a
brand with 0 products.

| Option | Result |
|---|---|
| **A. Run all of `05_post_import.sql` (recommended)** | Replaces categories with the 8 mains, hides the two dead nav links, deactivates `SAVE100`, drafts the Bark banner. |
| **B. Only replace categories, keep nav** | Dry Food / Wet Food show empty pages. |
| **C. Keep everything and fix manually in Admin** | More control; more clicks. |

If you choose the two-level taxonomy, section 5.1 still applies, but the
Dry Food / Wet Food links can later point at subcategory filters instead of
being hidden.

---

### 9. Wipe scope — confirm

The wipe deletes **all** rows in:

`promo_usage`, `payment`, `sales`, `feedback`, `order_details`, `orders`,
`cart_items`, `recommendation`, `product_price_history`, `product`.

It does **not** delete profiles, support tickets, site content, banners, or
audit logs.

- [ ] I confirm all orders and reviews can be deleted.
- [ ] I confirm customer accounts and support tickets should stay.

If you need to keep orders, do not run `03_wipe.sql`.

---

### 10. Backup — recommended

`02_backup.sql` creates `backup.product_20261029`, `backup.orders_20261029`,
etc. The `backup` schema is not exposed through the API. It uses extra storage
until you drop it.

- [ ] Create the backup.
- [ ] After 24–48 hours of checking the new catalog, run `drop schema backup cascade;`

---

### 11. Import method

| Option | Pros | Cons |
|---|---|---|
| **A. Admin → Products → Import (recommended)** | Server-side validation, audit log, automatic price history, preview before commit. | 6 batches, admin password/step-up, keep the tab open. |
| **B. Direct SQL** (`04_import_via_sql_optional.sql`) | Fast, one transaction. | Bypasses validation/audit; no automatic price history (optional backfill included); no preview per row. |

**Recommendation:** A.

---

### 12. Product IDs change

Every imported product gets a new UUID. Old product links, bookmarks, printed
QR codes, and the `SAVE100` target break. Orders are being deleted anyway.

- [ ] No external system depends on the old product IDs.
- [ ] It is acceptable that old product URLs 404.

If an external system stores product IDs, export it before the wipe.

---

### 13. Cost price and supplier

The sheet has no cost or supplier data. New products will have
`cost_price = null` and `supplier = null`, so margin reports are blank until
you fill them.

| Option | Result |
|---|---|
| **A. Accept (recommended)** | Margins show "—" until cost is entered. |
| **B. Provide a cost/supplier file** | I can merge it into the CSV/SQL. |

---

### 14. 311 DB-only products disappear

The workbook's **DB Only** tab lists products that exist in the current DB but
not in the new sheet (311 expected). Confirm they are discontinued.

- [ ] All 311 are intentionally removed.
- [ ] Some should stay — add them to the sheet/CSV before the wipe.

---

## Recommended path: main-only + Admin CSV import

### Step 0 — Review

Open `docs/whiskers-catalog-import-review-2026-10-29.xlsx`:

- **Products**: all 1,071 cleaned rows with the proposed category.
- **Needs Review**: the 48 excluded rows.
- **Category Map**: your literal Department/Type split vs the species-first mapping.
- **DB Exact Matches / Likely Matches / DB Only**: what matches or disappears.
- **Import Ready**: the 1,023 rows in the upload format. The workbook was
  generated with blank stock as 0; the actual upload CSV uses 10 (see the
  decision above). The CSV is authoritative.

### Step 1 — Preflight

Run `docs/sql/01_preflight.sql` in the Supabase SQL Editor. Confirm:

- `product` ≈ 465, `orders` 42, `order_details` 64, `payment` 40,
  `promo_usage` 1, `sales` 0, `feedback` 2, `cart_items` 14,
  `recommendation` 32, `product_price_history` 7.
- The foreign-key list includes the tables the wipe covers.
- `SAVE100` targets `da4785e9-24ca-4707-98e5-4abedb02419b`.
- `site_categories` still has the old category strings.

**Confirmed 2026-10-29:** the FK list matches `03_wipe.sql`:

- `cart_items.product_id` and `cart_items.product_id_new` → `product`
- `order_details.prod_id` (twice) → `product`; `order_details.order_id` → `orders`
- `feedback.prod_id` → `product`; `feedback.order_id` → `orders`
- `recommendation.prod_id` → `product`
- `product_price_history.prod_id` → `product` **ON DELETE CASCADE**
- `promo_usage.order_id` → `orders` **ON DELETE CASCADE**

No extra referencing table. `SAVE100` is active, targets
`da4785e9-24ca-4707-98e5-4abedb02419b`, and has `usage_count = 0`.

### Step 2 — Backup

Run `docs/sql/02_backup.sql`. Confirm the row counts match Step 1.

### Step 3 — Wipe

Run `docs/sql/03_wipe.sql`.

It aborts if:

- the backup is missing or its product count does not match,
- `product` is already empty,
- `product` has more than 5,000 rows,
- any foreign key blocks a delete.

After it commits, every table in the delete list should be at 0.

### Step 4 — Import

**Recommended (UI):**

1. Admin → Products → **Import**.
2. Choose `docs/whiskers-import-ready-2026-10-29.csv`.
3. The preview should show **1,023 products ready, 1,023 new, 0 skipped**.
4. Confirm and enter your admin password (step-up).
5. Keep the tab open. It sends 6 batches: 200, 200, 200, 200, 200, 23.
6. The result should be `created: 1023`, `errors: []`.

**Alternative (SQL):** run `docs/sql/04_import_via_sql_optional.sql`.
It is guarded to run only on an empty `product` table. It inserts 1,023 rows
and backfills one price-history row per product.

### Step 5 — Post-import

Run `docs/sql/05_post_import.sql`. It:

- replaces `site_categories` with the 8 mains,
- hides the Dry Food / Wet Food navbar links,
- deactivates `SAVE100`,
- drafts the Bark banner,
- prints verification counts.

Expected:

| Check | Expected |
|---|---:|
| `total_products` | 1,023 |
| `duplicate_names` | 0 |
| `missing_price` | 0 |
| `zero_stock` | 0 |
| `no_image` | 45 |
| `no_brand` | 31 |

Stock distribution: **741 at 10**, **186 at 5**, **96 at 50**.

Category counts: Cats 383, Dogs 307, Fish 72, Birds 5, Small Pets 8,
Reptiles 2, Health & Wellness 111, Grooming & Hygiene 135.

### Step 5b — Optional: copy images into the bucket

`05_post_import.sql` does **not** touch images. The 978 external URLs remain
external until you run the localization script. See
`docs/LOCALIZE-PRODUCT-IMAGES.md`; the safe order is:

```bash
cd backend
npm run localize-images -- --check --limit=20
npm run localize-images -- --apply --limit=10
npm run localize-images -- --apply
```

This is optional. It can also be done later.

### Step 6 — Cache / restart

The site-content cache is 30 seconds. If you ran the SQL directly, wait 30
seconds or restart the backend so the new `site_categories` and nav rows load.
The product data itself is read live; a hard refresh is enough.

### Step 7 — Smoke test

- [ ] `/menu` shows 8 categories.
- [ ] Cats / Dogs / Fish / Birds / Small Pets filters return products.
- [ ] Search finds a known product.
- [ ] A product page shows name, price, brand, image (or placeholder).
- [ ] Add to cart and checkout with a test order.
- [ ] Admin → Products shows 1,023 rows; import result showed 0 errors.
- [ ] Old category URLs (`Dogs - DRY`, `Wet Food`) do not appear in the menu.
- [ ] `SAVE100` is no longer applied at checkout.

### Step 8 — Cleanup

After 24–48 hours:

```sql
drop schema backup cascade;
```

---

## Verification queries (post-import)

```sql
-- total
select count(*) from public.product;                       -- 1023

-- categories
select category, count(*) from public.product
group by category order by category;

-- duplicates (direct SQL import bypasses the app's name check)
select lower(trim(prod_name)), count(*)
from public.product
group by 1 having count(*) > 1;

-- data quality
select
  count(*) filter (where price is null)              as missing_price,
  count(*) filter (where stock_quantity = 0)         as zero_stock,
  count(*) filter (where image_url is null or image_url = '') as no_image,
  count(*) filter (where brand is null or brand = '')         as no_brand
from public.product;
```

---

## Rollback

The `backup` schema holds the pre-wipe rows with their original IDs. Restore
in dependency order:

1. `product`
2. `orders`
3. `order_details`
4. `payment`
5. `sales`
6. `promo_usage`
7. `feedback`
8. `cart_items`
9. `recommendation`
10. `product_price_history`

Example for products:

```sql
begin;
delete from public.product;  -- only if you want to discard the new catalog
insert into public.product select * from backup.product_20261029;
commit;
```

Then restore the order tables from their backups. Because the backup tables
are plain `CREATE TABLE AS` copies, they have no constraints, so restore the
parent (`product`, `orders`) before the children.

This is a full replacement, not a merge. If you restore the old products,
first delete the new catalog in the same child-to-parent order as
`03_wipe.sql` (the backup-count guard in that file compares against the old
465-row backup, so it will refuse to run after the new import). Then restore
the old rows.

---

## Known caveats

- **The upload CSV has no `subcategory` column.** The built-in importer ignores
  it. The subcategory CSV, migration, and backfill are prepared separately in
  `docs/SUBCATEGORY-UPGRADE-PLAN.md`; they are not part of this import.
- **Images stay as external URLs until you localize them.** The bulk import
  writes `image_url` as-is; it does not download the images or copy them into
  the `product-images` bucket. The storefront loads the retailer URLs directly.
  Run `docs/LOCALIZE-PRODUCT-IMAGES.md` when you want them copied into the
  bucket.
- **No DB unique constraint on product names.** The Admin importer checks
  names; the direct SQL file does not. That is why the SQL file refuses to run
  unless `product` is empty.
- **All 1,023 rows are active.** If you want some hidden, change `is_active`
  in the CSV before importing.
- **The 502 Groq issue is separate.** AI drafting and AI search stay broken
  until `GROQ_API_KEY` in `backend/.env` is replaced with a valid key and the
  backend is restarted. `nodemon` does not reload `.env`.
- **The old product IDs are gone.** The `SAVE100` promo cannot be re-pointed
  because its product is not in the new sheet.
