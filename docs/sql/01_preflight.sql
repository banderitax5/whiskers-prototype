-- 01 — PREFLIGHT (read-only; changes nothing)
-- Run this in the Supabase SQL Editor before anything destructive.
-- Confirm the counts and foreign keys match what you expect.

-- 1. Rows that the wipe will delete
select 'product'                as table_name, count(*) as rows from public.product
union all select 'product_price_history', count(*) from public.product_price_history
union all select 'cart_items',            count(*) from public.cart_items
union all select 'orders',                count(*) from public.orders
union all select 'order_details',         count(*) from public.order_details
union all select 'payment',               count(*) from public.payment
union all select 'promo_usage',           count(*) from public.promo_usage
union all select 'sales',                 count(*) from public.sales
union all select 'feedback',              count(*) from public.feedback
union all select 'recommendation',        count(*) from public.recommendation
order by table_name;

-- 2. Foreign keys that point at product / orders.
-- The wipe deletes children first; this confirms nothing is missing.
select
  conrelid::regclass        as referencing_table,
  confrelid::regclass       as referenced_table,
  conname                   as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid in ('public.product'::regclass, 'public.orders'::regclass)
order by 1, 2;

-- 3. Product-scoped promos: these will point at a deleted product.
select code, scope, target_id, is_active, usage_count
from public.promos
where scope = 'product';

-- 4. Category and nav links that become stale after a main-only import.
select name, label, sort_order, is_visible
from public.site_categories
order by sort_order;

select section, label, href, sort_order, is_visible
from public.site_nav_items
where href ilike '%category=%'
order by section, sort_order;

-- 5. Published banners that point at categories or brands.
select id, title, status, placement, link_type, link_target
from public.site_banners
where status = 'published'
  and link_type in ('category', 'brand')
order by placement, sort_order;

-- 6. Duplicate names currently in the DB (the wipe resolves these).
select lower(trim(prod_name)) as name_key, count(*) as copies
from public.product
group by 1
having count(*) > 1
order by copies desc, name_key;

-- 7. DB-only products (311 expected) are listed in the workbook tab "DB Only".
--    There is no reliable way to compare against the CSV from SQL alone.
