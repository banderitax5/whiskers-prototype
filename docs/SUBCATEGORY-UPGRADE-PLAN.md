# Subcategory upgrade plan — prepared, not applied

**Status:** Main-only import is the current path. These assets are ready if you
later decide to add subcategory browsing. Nothing here has been applied.

---

## What is already prepared

| Asset | Purpose |
|---|---|
| `docs/sql/00_optional_add_subcategory.sql` | Adds `product.subcategory`, an index, and the public select grant. |
| `docs/whiskers-import-ready-with-subcategory-2026-10-29.csv` | The same 1,023 products with a `subcategory` column. |
| `docs/sql/06_backfill_subcategory_optional.sql` | Fills `subcategory` on the already-imported products by exact product name. |

The backfill is the important one: because you are importing main-only now,
you do **not** need to re-import the catalog later. Run the migration, then the
backfill, and the 1,023 rows get their subcategory.

---

## The data model

Keep both fields on `product`:

- `category` = species / department: `Cats`, `Dogs`, `Fish`, `Birds`,
  `Small Pets`, `Reptiles`, `Health & Wellness`, `Grooming & Hygiene`
- `subcategory` = product form: `Dry Food`, `Wet Food (Can)`, `Treats`,
  `Litter`, `Shampoo`, etc.

Do **not** encode subcategory into `category` as `"Dogs - Dry Food"`. It
technically works with the Menu's substring filter, but it produces one flat
list of 26+ checkboxes and makes main-category links fragile.

A lookup table is not necessary for 26 values. A text column with a datalist
in the admin form is enough; add a lookup table only if the list needs
per-subcategory images, ordering, or SEO pages.

---

## Subcategories in the prepared CSV

| Subcategory | Rows |
|---|---:|
| Dry Food | 235 |
| Wet Food (Can) | 145 |
| Treats | 122 |
| Wet Food (Pouch) | 102 |
| Litter | 96 |
| Veterinary Diet | 75 |
| Shampoo | 64 |
| Diapers | 27 |
| Vitamins | 26 |
| Medicine | 26 |
| Flea & Tick (Spot On) | 15 |
| Shampoo with Conditioner | 14 |
| Anti-Mange | 11 |
| Pee Pads | 11 |
| Soap | 11 |
| Anti-Fungal | 8 |
| Deworming | 6 |
| Dextrose | 6 |
| Flea & Tick (Tablet) | 5 |
| Flea & Tick + Deworm | 4 |
| Milk | 3 |
| Perfume | 3 |
| Powder | 3 |
| Wet Food (Cup) | 2 |
| Wipes | 2 |
| Flea & Tick (Treats) | 1 |

26 subcategories total.

---

## Code changes needed for the feature

### 1. Database
- Run `00_optional_add_subcategory.sql`.
- Run `06_backfill_subcategory_optional.sql` after the main import.
- Verify 1,023 rows have a subcategory.

### 2. Backend
- `backend/src/utils/adminInput.js`
  - `sanitizeProductCreate`: trim `subcategory`, max 120, add to the insert map.
  - `sanitizeProductPatch`: allow `subcategory`, max 120, `null` clears it.
- `backend/src/routes/admin.js`
  - The import route already passes rows through the sanitizers; once the
    sanitizer accepts `subcategory`, the importer stores it.
  - Product list filters can optionally accept `?subcategory=`.
- `backend/src/routes/products.js` (or wherever the public product select is)
  - Include `subcategory` in the selected columns.
  - Optional: support `?subcategory=` server-side. The Menu can also filter
    client-side because it already loads the catalog.
- `backend/migrations/...` — `00` is the migration.

### 3. CSV import / export
- `frontend/src/lib/productCsv.js`
  - Add `subcategory` to the header alias map.
  - Add it to the parsed row and the import template.
  - Add it to the export header if the backend export is extended.
- `frontend/src/components/AdminProductManagement.jsx`
  - Import preview shows the column.
  - Product form gets a subcategory input (datalist of the 26 values).
  - Product table/filter can show it.

### 4. Storefront
- `frontend/src/pages/Menu.jsx`
  - Add a `sub` URL param and filter state.
  - Derive subcategory options from the products in the selected category.
  - Filter `product.subcategory` exactly; combine with `category`.
  - Add a second checkbox group under the category group.
- `frontend/src/pages/ProductDetail.jsx` / product cards
  - Show `Category · Subcategory` instead of just category.
- `frontend/src/lib/siteContent.js`
  - Main category overrides stay as-is; subcategories are derived from
    products, not `site_categories`.
- `site_nav_items`
  - Repoint:
    - **Dry Food** → `/menu?category=Dogs&sub=Dry%20Food`
    - **Wet Food** → `/menu?category=Dogs&sub=Wet%20Food%20(Can),Wet%20Food%20(Pouch),Wet%20Food%20(Cup)`
  - The Menu must accept comma-separated `sub` values for the Wet Food group.
- `frontend/src/lib/recommendEngine.js`
  - No change; it uses `category` prefixes and stays species-correct.

### 5. Tests
- `productCsv` parsing with/without `subcategory`.
- `adminInput` create/patch bounds.
- Menu filter: category + subcategory + multiple sub values.
- Backfill count on a fixture.
- Recommendation species still works for `Cats` / `Dogs` / `Fish` / `Birds`.

---

## Rollout order

1. Run `00_optional_add_subcategory.sql`.
2. Run `06_backfill_subcategory_optional.sql` (expect 1,023).
3. Deploy the backend sanitizer + public select changes.
4. Deploy the CSV importer/admin form changes.
5. Deploy the Menu subcategory filter + nav links.
6. Test with a few categories:
   - Dogs → Dry Food
   - Dogs → Wet Food (all three variants)
   - Cats → Litter
   - Health & Wellness → Vitamins
7. Keep the main-only nav working until the filter is live; then repoint
   Dry Food / Wet Food.

---

## Edge cases

- **Renamed products:** the backfill matches exact names. If you rename a
  product after import, it will be skipped; the final count will show it.
- **Wet Food variants:** three subcategories. The nav link needs a multi-value
  filter, or a small mapping table if you want one "Wet Food" group.
- **Built-in importer:** it ignores unknown columns today. Update
  `productCsv.js` before using the subcategory CSV for future imports.
- **Public API:** the column-level grant in `00` is required; without it the
  storefront's anon key cannot read `subcategory`.
- **Existing `site_categories`:** it remains the main-category override layer.
  Do not put subcategories there; they are product data.

---

## Estimated effort

- DB + backfill: minutes.
- Backend sanitizer + public select: small.
- CSV importer/admin form: small.
- Menu filter + nav links: the main work.
- Tests and polish: the rest.

Roughly **one focused day** for the full feature, less if the Menu filter is
kept simple.
