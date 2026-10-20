-- 2026-10-20_revoke_client_table_writes.sql
--
-- Closes direct PostgREST write bypasses, proven live 2026-10-20: a normal
-- user's JWT + the publishable (anon) key wrote a junk phone straight into
-- profiles (HTTP 204, value stored) and created a full orders row (HTTP 201),
-- skipping every backend validation (address rules, stock, payment, promos,
-- receipts). cart_items/order_details/payment share the same grant class.
-- product's UPDATE grant is likewise open; its RLS currently filters all
-- rows for ordinary users, but that policy lives in the dashboard, not in
-- this repo - revoked here as defense in depth.
--
-- Why this is safe: the browser never writes these tables directly (zero
-- .from('profiles'|'orders'|'order_details'|'payment'|'cart_items'|'product')
-- calls in frontend/src). All writes go through the backend API, which uses
-- the service_role key (bypasses RLS and keeps its own grants - untouched
-- here). Authenticated READS are unchanged: order history, cart view, the
-- per-request role check, and admin lists still SELECT as before.
--
-- Deploy order: the backend flips its writes to service_role FIRST (that
-- code ships independently and works with or without this migration), then
-- run this. There is no breakage window in either order once the new
-- backend is live; running this against an OLD backend would break cart
-- and checkout writes, so update the backend before running it.
--
-- Owner action: paste into the Supabase SQL editor and run, then restart
-- the backend on :4141 (habit, nothing is cached).
--
-- RLS is deliberately NOT touched: enabling it blindly could block the
-- authenticated SELECT paths the backend still relies on if a SELECT
-- policy is missing. The grant revocation below stops PostgREST writes
-- regardless of each table's RLS state.

revoke insert, update, delete, truncate
  on table public.profiles,
         public.orders,
         public.order_details,
         public.payment,
         public.cart_items,
         public.product
  from public, anon, authenticated;

-- service_role keeps its default grants (never revoked) - backend writes
-- continue to work, as they already do for the site_* / promos tables.

-- rollback (restore Supabase's default-style grants):
-- grant insert, update, delete on table public.profiles to authenticated;
-- grant insert, update, delete on table public.orders to authenticated;
-- grant insert, update, delete on table public.order_details to authenticated;
-- grant insert, update, delete on table public.payment to authenticated;
-- grant insert, update, delete on table public.cart_items to authenticated;
-- grant insert, update, delete on table public.product to authenticated;
-- (repeat for anon / public only if a feature ever needs unauthenticated
-- writes again - none does today.)
