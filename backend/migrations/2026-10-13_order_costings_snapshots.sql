-- Phase 3 order costings: sale-time price/cost snapshots on each order line.
-- additive only; the backend degrades cleanly until this is applied (checkout
-- omits the snapshot keys, admin orders keep working without margin fields).
-- owner must run this by hand; the app never executes DDL itself.

-- 1. order line snapshots -------------------------------------------------
-- unit_price = selling price per unit at the moment of checkout.
-- unit_cost  = product cost_price per unit at checkout (null when the product
--              had no recorded cost - never invent one).
-- subtotal (existing) = unit_price * quantity at checkout time; kept as the
--              authoritative line revenue so receipts stay stable.
alter table public.order_details
  add column if not exists unit_price numeric(12,2),
  add column if not exists unit_cost numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0;

-- money columns must never go negative: a negative cost would silently
-- corrupt margin math, a negative price means a bug upstream.
alter table public.order_details drop constraint if exists order_details_unit_price_ck;
alter table public.order_details add constraint order_details_unit_price_ck
  check (unit_price is null or unit_price >= 0);
alter table public.order_details drop constraint if exists order_details_unit_cost_ck;
alter table public.order_details add constraint order_details_unit_cost_ck
  check (unit_cost is null or unit_cost >= 0);
alter table public.order_details drop constraint if exists order_details_discount_amount_ck;
alter table public.order_details add constraint order_details_discount_amount_ck
  check (discount_amount >= 0);

-- 2. effective_price(): the canonical per-unit sale price of an order line --
-- (line revenue after any line discount) / quantity.
-- Rows written before M3 have no unit_price snapshot: fall back to
-- subtotal / quantity, which is exact for every historical row.
-- discount_amount is per line (Promos, Phase 4) and is spread per unit.
-- EVERY column is cast to numeric explicitly: quantity and subtotal are
-- legacy double precision (verified against the live schema), so a single
-- uncast leaf makes the whole expression double - and round(double, int)
-- does not exist, nor is floating point a sound basis for money.
create or replace function public.effective_price(od public.order_details)
returns numeric
language sql
stable
as $$
  select round(
    (coalesce(od.unit_price::numeric * od.quantity::numeric,
              od.subtotal::numeric,
              0)
     - coalesce(od.discount_amount::numeric, 0))
    / nullif(od.quantity::numeric, 0),
    2
  );
$$;

comment on function public.effective_price(public.order_details) is
  'Canonical per-unit sale price after line discounts; falls back to subtotal/quantity for pre-snapshot rows. Mirrored by backend utils/orderCosting.js (effectiveUnitPrice) - E2E asserts both agree.';

-- service-role only: anon/authenticated reach order lines exclusively through
-- the backend API, which never exposes cost fields to non-admin callers.
revoke execute on function public.effective_price(public.order_details) from public, anon, authenticated;
grant execute on function public.effective_price(public.order_details) to service_role;

-- rollback (only if you need to undo) -----------------------------------
-- revoke execute on function public.effective_price(public.order_details) from service_role;
-- drop function if exists public.effective_price(public.order_details);
-- alter table public.order_details drop constraint if exists order_details_discount_amount_ck;
-- alter table public.order_details drop constraint if exists order_details_unit_cost_ck;
-- alter table public.order_details drop constraint if exists order_details_unit_price_ck;
-- alter table public.order_details drop column if exists discount_amount;
-- alter table public.order_details drop column if exists unit_cost;
-- alter table public.order_details drop column if exists unit_price;
