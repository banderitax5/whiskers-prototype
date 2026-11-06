-- 05 — POST-IMPORT (run after the CSV/SQL import)
-- This assumes the main-only taxonomy (8 categories) and the exact CSV.
-- If you chose the two-level subcategory model, skip section 5.1 for now
-- and tell me before running the nav updates.

begin;

-- 5.1 Replace the old category strings with the 8 main categories.
--     The old rows (Dogs - DRY, Dogs - TREATS, Pets Milk, ...) would
--     otherwise show as empty categories in the menu.
delete from public.site_categories;

insert into public.site_categories (name, label, sort_order, is_visible) values
  ('Cats',              null, 0, true),
  ('Dogs',              null, 1, true),
  ('Fish',              null, 2, true),
  ('Birds',             null, 3, true),
  ('Small Pets',        null, 4, true),
  ('Reptiles',          null, 5, true),
  ('Health & Wellness', null, 6, true),
  ('Grooming & Hygiene',null, 7, true);

-- 5.2 Hide navbar links that no longer map to a category.
--     "Dry Food" pointed at "Dogs - DRY"; "Wet Food" pointed at a category
--     that no longer exists. Re-enable them if you add subcategory filters.
update public.site_nav_items
set is_visible = false
where section = 'navbar'
  and label in ('Dry Food', 'Wet Food');

-- 5.3 Deactivate the product-scoped promo whose product was wiped.
--     SAVE100 targeted Alpha Pro 10kg (not in the new sheet).
update public.promos
set is_active = false
where code = 'SAVE100';

-- promo_usage was wiped, so the counters would otherwise be stale.
update public.promos
set usage_count = 0;

-- 5.4 Hide the Bark brand banner: the new catalog has 0 Bark products.
update public.site_banners
set status = 'draft'
where status = 'published'
  and link_type = 'brand'
  and link_target = '/menu?brand=Bark';

commit;

-- 5.5 Verification. Expected: 1,023 products, 8 categories, 0 duplicates,
--     0 missing prices, 0 zero-stock rows. The image/brand counts are
--     informational.
select count(*) as total_products from public.product;

select category, count(*) as products
from public.product
group by category
order by category;

select count(*) as duplicate_names
from (
  select lower(trim(prod_name))
  from public.product
  group by 1
  having count(*) > 1
) d;

select count(*) as missing_price from public.product where price is null;
select count(*) as zero_stock    from public.product where stock_quantity = 0;
select count(*) as no_image      from public.product where image_url is null or image_url = '';
select count(*) as no_brand      from public.product where brand is null or brand = '';

-- 5.6 Category rows should be exactly these 8.
select name, label, sort_order, is_visible
from public.site_categories
order by sort_order;
