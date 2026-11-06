-- 2026-11-07_push_subscriptions.sql
--
-- Web Push subscriptions for the back office. When a shopper places an order,
-- every signed-in staff/admin device that opted in gets a system notification
-- (lock screen + notification shade on a phone, Action Center on Windows).
--
-- Why a table: a push subscription is an endpoint URL plus two keys that the
-- browser generates. The server has to remember them between visits, otherwise
-- it can only notify a tab that is already open.
--
-- Access: the browser never reads this table. Only the backend (service_role)
-- writes and reads it, so a leaked anon key cannot list anyone's endpoints.
--
-- Owner action: paste this into the Supabase SQL editor and run it once.
-- The app keeps working without it: the bell button in the admin top bar shows
-- "not available yet" and order notifications are silently skipped.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- one row per browser/device. The endpoint is unique, so subscribing twice
  -- from the same browser updates the keys instead of adding a duplicate.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- no policies on purpose: RLS + revoked grants means even a signed-in shopper
-- with the publishable key cannot read or write this table.
revoke all on public.push_subscriptions from public, anon, authenticated;
grant all on public.push_subscriptions to service_role;

-- Rollback:
-- drop table if exists public.push_subscriptions;
