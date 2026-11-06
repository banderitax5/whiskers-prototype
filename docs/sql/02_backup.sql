-- 02 — BACKUP (run before the wipe)
-- Snapshots the tables that will be deleted or edited into a separate
-- "backup" schema. That schema is not exposed through the REST API.
--
-- If a backup table already exists, this script leaves it alone
-- (CREATE TABLE IF NOT EXISTS ... AS SELECT does not overwrite).
--
-- These are fixed-name snapshots. For a fresh snapshot, drop the old one first:
--   drop schema backup cascade;
-- Then run this file again. Do this immediately before 03_wipe.sql.

create schema if not exists backup;

create table if not exists backup.product_20261029                as select * from public.product;
create table if not exists backup.product_price_history_20261029  as select * from public.product_price_history;
create table if not exists backup.cart_items_20261029             as select * from public.cart_items;
create table if not exists backup.orders_20261029                 as select * from public.orders;
create table if not exists backup.order_details_20261029          as select * from public.order_details;
create table if not exists backup.payment_20261029                as select * from public.payment;
create table if not exists backup.promo_usage_20261029            as select * from public.promo_usage;
create table if not exists backup.sales_20261029                  as select * from public.sales;
create table if not exists backup.feedback_20261029               as select * from public.feedback;
create table if not exists backup.recommendation_20261029         as select * from public.recommendation;
create table if not exists backup.promos_20261029                 as select * from public.promos;
create table if not exists backup.site_categories_20261029        as select * from public.site_categories;
create table if not exists backup.site_nav_items_20261029         as select * from public.site_nav_items;
create table if not exists backup.site_banners_20261029           as select * from public.site_banners;
create table if not exists backup.site_home_sections_20261029     as select * from public.site_home_sections;

-- Keep the snapshot out of the API roles.
revoke all on schema backup from anon, authenticated;
revoke all on all tables in schema backup from anon, authenticated;

-- Verify the copies.
select 'product'               as table_name, count(*) as rows from backup.product_20261029
union all select 'product_price_history', count(*) from backup.product_price_history_20261029
union all select 'cart_items',            count(*) from backup.cart_items_20261029
union all select 'orders',                count(*) from backup.orders_20261029
union all select 'order_details',         count(*) from backup.order_details_20261029
union all select 'payment',               count(*) from backup.payment_20261029
union all select 'promo_usage',           count(*) from backup.promo_usage_20261029
union all select 'sales',                 count(*) from backup.sales_20261029
union all select 'feedback',              count(*) from backup.feedback_20261029
union all select 'recommendation',        count(*) from backup.recommendation_20261029
order by table_name;
