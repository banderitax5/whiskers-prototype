-- Phase 2 costings foundation: cost/supplier columns, the archive marker,
-- and the selling-price history trail.
--
-- additive only; the backend degrades cleanly until this is applied
-- (cost/archive writes answer 503 MIGRATION_REQUIRED, reads keep working).
-- owner must run this by hand; the app never executes DDL itself.

-- 1. product gains costing + archive columns -----------------------------
alter table public.product add column if not exists cost_price numeric(12,2);
alter table public.product add column if not exists supplier text;
alter table public.product add column if not exists archived_at timestamptz;

-- cost is money: never negative. price has no historical check, but cost
-- gets one because a negative cost would silently corrupt margin math.
alter table public.product drop constraint if exists product_cost_price_ck;
alter table public.product add constraint product_cost_price_ck
  check (cost_price is null or cost_price >= 0);

-- 2. selling-price history: one row per price change ---------------------
-- old_price null = the first recorded price (product create).
-- on delete cascade so history never outlives its product as an orphan.
create table if not exists public.product_price_history (
  id         bigint generated always as identity primary key,
  prod_id    uuid         not null references public.product (prod_id) on delete cascade,
  old_price  numeric(12,2),
  new_price  numeric(12,2) not null,
  changed_by text,
  created_at timestamptz  not null default now()
);

create index if not exists product_price_history_prod_created_idx
  on public.product_price_history (prod_id, created_at desc);

-- 3. lock the history table ---------------------------------------------
-- RLS on with zero policies = anon/authenticated read nothing;
-- explicit revoke on top (new Supabase tables get default grants).
-- only the service_role backend (bypasses RLS) reads or writes it.
alter table public.product_price_history enable row level security;
revoke all on table public.product_price_history from public, anon, authenticated;

-- 4. cost columns must never be readable through the public anon key -----
-- the anon key ships in the browser bundle, and PostgREST exposes every
-- table it has privileges for, so table-level SELECT on product is revoked
-- and re-granted column by column for exactly the public columns.
-- service_role (backend) is unaffected; authenticated-role reads
-- (cart/checkout live price checks) use only these granted columns.
revoke select on table public.product from anon, authenticated;
grant select (
  prod_id, created_at, prod_name, category, price, stock_quantity,
  brand, image_url, is_active, description, details
) on table public.product to anon, authenticated;

-- rollback (only if you need to undo) -----------------------------------
-- revoke select (prod_id, created_at, prod_name, category, price, stock_quantity,
--   brand, image_url, is_active, description, details)
--   on table public.product from anon, authenticated;
-- grant select on table public.product to anon, authenticated;
-- drop table if exists public.product_price_history;
-- alter table public.product drop constraint if exists product_cost_price_ck;
-- alter table public.product drop column if exists archived_at;
-- alter table public.product drop column if exists supplier;
-- alter table public.product drop column if exists cost_price;
