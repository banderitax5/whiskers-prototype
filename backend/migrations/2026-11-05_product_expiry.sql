-- 2026-11-05_product_expiry.sql
--
-- Products can now carry an optional expiry ("best before") date. Pet food and
-- treats go stale, and until now the shop had no way to record that.
--
-- Why a plain `date` and not a timestamp: an expiry is a calendar day printed
-- on the pack, not a moment. Storing a date keeps it immune to timezone drift
-- (a "2026-12-31" pack must not become Dec 30 for a shopper in another zone).
--
-- Nullable on purpose: accessories, toys and anything else without a shelf
-- life simply have no expiry, so every existing row stays valid.
--
-- Owner action: paste this into the Supabase SQL editor and run it once.
-- The app keeps working without it (the admin list simply omits the column and
-- saving an expiry answers 503 "waiting on a database update" until it runs).

alter table public.product add column if not exists expires_at date;

comment on column public.product.expires_at is
  'Optional best-before date. null = no expiry tracked for this product.';

-- Rollback:
-- alter table public.product drop column if exists expires_at;
