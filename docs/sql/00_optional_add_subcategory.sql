-- 00 — OPTIONAL: add a subcategory column (two-level taxonomy)
-- Only run this if you choose to store "Dry Food", "Wet Food", "Treats", etc.
-- The current built-in CSV importer does NOT write this column. If you add it,
-- use the direct-SQL import route or ask for the subcategory version of the
-- CSV/SQL to be generated.
--
-- This is additive and safe to run before the wipe.

alter table public.product
  add column if not exists subcategory text;

create index if not exists product_category_subcategory_idx
  on public.product (category, subcategory);

-- The public product grant is column-by-column (see the costing migration).
-- Make the new column readable by the storefront when selected explicitly.
grant select (subcategory) on table public.product to anon, authenticated;

-- Ask PostgREST to pick up the new column immediately.
notify pgrst, 'reload schema';
