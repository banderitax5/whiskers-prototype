-- Phase 4: Promos / discount codes
-- owner runs this by hand; the app never executes DDL itself.

create type public.promo_type as enum ('percent', 'fixed', 'free_shipping');
create type public.promo_scope as enum ('sitewide', 'category', 'product');

create table public.promos (
  code text primary key,
  type public.promo_type not null,
  value numeric(12,2) not null check (value >= 0),
  scope public.promo_scope not null default 'sitewide',
  target_id uuid,
  min_subtotal numeric(12,2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(12,2),
  usage_limit integer,
  usage_count integer not null default 0 check (usage_count >= 0),
  per_user_limit integer not null default 1 check (per_user_limit >= 1),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index promos_active_window_idx on public.promos (is_active, starts_at, ends_at) where is_active = true;
create index promos_scope_target_idx on public.promos (scope, target_id);

alter table public.promos enable row level security;

-- no public read: the promo list must not be enumerable by anonymous
-- clients (a code is only "public" once the shop shares it). Validation
-- runs in the backend (POST /api/orders/validate-promo) with service_role.
revoke all on public.promos from anon, authenticated;
grant select on public.promos to service_role;
grant insert, update, delete on public.promos to service_role;

-- promo_usage: tracks redemptions per user per code
create table public.promo_usage (
  id bigserial primary key,
  promo_code text not null references public.promos(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(order_id) on delete cascade,
  discount_applied numeric(12,2) not null check (discount_applied >= 0),
  created_at timestamptz not null default now()
);

create index promo_usage_promo_user_idx on public.promo_usage (promo_code, user_id);
create index promo_usage_order_idx on public.promo_usage (order_id);

alter table public.promo_usage enable row level security;

create policy promo_usage_user_own on public.promo_usage
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.promo_usage from anon, authenticated;
grant all on public.promo_usage to service_role;

-- rollback (if needed):
-- drop table if exists public.promo_usage;
-- drop table if exists public.promos;
-- drop type if exists public.promo_type;
-- drop type if exists public.promo_scope;