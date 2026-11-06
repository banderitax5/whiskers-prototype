-- 03 — WIPE (destructive)
-- Deletes all orders, cart/recommendation/review rows, price history, and
-- products. Customer profiles, support tickets, site content, banners, and
-- audit logs are left alone.
--
-- Run 02_backup.sql first. If any foreign key is missing from this list,
-- the whole transaction aborts and nothing is deleted.

begin;

-- Safety: the backup must exist and match the current product count.
do $$
declare
  live_count bigint;
  backup_count bigint;
begin
  if to_regclass('backup.product_20261029') is null then
    raise exception 'backup.product_20261029 is missing; run 02_backup.sql first';
  end if;

  select count(*) into live_count from public.product;
  select count(*) into backup_count from backup.product_20261029;

  if backup_count <> live_count then
    raise exception 'backup product count (%) does not match live product count (%); drop the backup.*_20261029 tables and re-run 02_backup.sql',
      backup_count, live_count;
  end if;

  if live_count = 0 then
    raise exception 'product table is already empty; nothing to wipe';
  end if;

  if live_count > 5000 then
    raise exception 'product table has % rows; refusing to wipe (expected about 465)', live_count;
  end if;
end $$;

-- Children first. Order matters when a foreign key is RESTRICT/NO ACTION.
delete from public.promo_usage;
delete from public.payment;
delete from public.sales;
delete from public.feedback;
delete from public.order_details;
delete from public.orders;
delete from public.cart_items;
delete from public.recommendation;
delete from public.product_price_history;
delete from public.product;

-- If anything survived, abort instead of committing a partial wipe.
do $$
begin
  if (select count(*) from public.product) > 0 then
    raise exception 'wipe incomplete: product still has rows';
  end if;
  if (select count(*) from public.orders) > 0 then
    raise exception 'wipe incomplete: orders still has rows';
  end if;
end $$;

commit;
