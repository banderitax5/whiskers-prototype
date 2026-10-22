-- Phase 1.5 (owner-requested): legacy money columns double precision -> exact numeric.
-- Why: double precision is floating point - wrong tool for money (tiny rounding
-- drift possible in sums). All existing values were audited first (read-only):
--   product.price       465 rows (414 null, 51 whole-peso, none negative, none >2dp)
--   orders.total_amount 18 rows, all whole-peso, none negative
--   payment.amount      18 rows, all whole-peso, none negative
--   order_details.quantity 31 rows, all whole (1..4)  -> integer
--   order_details.subtotal 31 rows (9 null), whole-peso, none negative
--   sales.*             seeded analytics table (dashboard totalProfit) - 0 rows currently
-- Because no value has more than 2 decimal places, round(...,2) is a no-op:
-- stored values are IDENTICAL before and after; only the column type changes.
-- Customer-visible output (prices, totals, receipts) does not change.
-- owner runs this by hand; the app never executes DDL itself.

alter table public.product
  alter column price type numeric(12,2) using round(price::numeric, 2);

alter table public.orders
  alter column total_amount type numeric(12,2) using round(total_amount::numeric, 2);

alter table public.payment
  alter column amount type numeric(12,2) using round(amount::numeric, 2);

alter table public.order_details
  alter column quantity type integer using trunc(quantity)::integer,
  alter column subtotal type numeric(12,2) using round(subtotal::numeric, 2);

-- sales: table or view? (no DDL in repo history). Guard so the script never
-- dies on wrong_object_type; a view would need a different approach.
do $$
begin
  if exists (select 1 from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'sales' and c.relkind = 'r') then
    execute 'alter table public.sales alter column total_amount type numeric(12,2) using round(total_amount::numeric, 2)';
    execute 'alter table public.sales alter column profit type numeric(12,2) using round(profit::numeric, 2)';
    raise notice 'sales: converted (base table)';
  else
    raise notice 'sales: NOT a base table (relkind=%) - skipped, report back',
 (select c.relkind::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='sales');
  end if;
end $$;

-- rollback (run only if needed - converts back to the legacy types):
-- alter table public.product alter column price type double precision using price::double precision;
-- alter table public.orders alter column total_amount type double precision using total_amount::double precision;
-- alter table public.payment alter column amount type double precision using amount::double precision;
-- alter table public.order_details alter column quantity type double precision using quantity::double precision;
-- alter table public.order_details alter column subtotal type double precision using subtotal::double precision;
-- alter table public.sales alter column total_amount type double precision using total_amount::double precision;
-- alter table public.sales alter column profit type double precision using profit::double precision;