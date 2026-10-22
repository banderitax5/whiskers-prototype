-- Phase 5: content and display control (owner-run; additive only).
-- Every table is new; product gains three nullable/defaulted columns only.
-- No existing column is renamed, retyped, or dropped. Rollback at the bottom.

create table if not exists public.site_media (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  storage_path text,
  alt_text text not null default '',
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes >= 0),
  width integer,
  height integer,
  is_broken boolean not null default false,
  last_broken_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('home_hero', 'brand_strip', 'category_top', 'promo_strip', 'announcement_bar')),
  desktop_image_url text not null,
  mobile_image_url text,
  alt text not null default '',
  title text,
  subtitle text,
  button_text text,
  link_type text not null default 'none' check (link_type in ('none', 'product', 'category', 'promo', 'url')),
  link_target text,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists site_banners_placement_idx
  on public.site_banners (placement, sort_order) where archived_at is null;

create table if not exists public.site_banner_events (
  id bigserial primary key,
  banner_id uuid not null references public.site_banners (id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click', 'broken')),
  created_at timestamptz not null default now()
);

create index if not exists site_banner_events_banner_idx
  on public.site_banner_events (banner_id, event_type);

create table if not exists public.site_home_sections (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('hero_carousel', 'product_row', 'category_tiles', 'promo_banner', 'text_block', 'brand_strip')),
  title text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists site_home_sections_order_idx
  on public.site_home_sections (sort_order) where archived_at is null;

create table if not exists public.site_nav_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('navbar', 'footer_shop', 'footer_account', 'footer_social')),
  label text not null,
  href text not null check (href ~ '^(/|https?://)'),
  image_url text,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists site_nav_items_section_idx
  on public.site_nav_items (section, sort_order) where archived_at is null;

create table if not exists public.site_categories (
  name text primary key,
  image_url text,
  label text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_content_history (
  id bigserial primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  snapshot jsonb not null,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists site_content_history_entity_idx
  on public.site_content_history (entity, entity_id, created_at desc);

alter table public.product add column if not exists featured boolean not null default false;
alter table public.product add column if not exists badge_text text;
alter table public.product add column if not exists sort_weight integer not null default 0;

alter table public.site_media enable row level security;
alter table public.site_banners enable row level security;
alter table public.site_banner_events enable row level security;
alter table public.site_home_sections enable row level security;
alter table public.site_nav_items enable row level security;
alter table public.site_categories enable row level security;
alter table public.site_content_history enable row level security;

-- No anon/authenticated grants on purpose: every read goes through the
-- backend endpoint, which filters to published + in-window rows only, so
-- drafts and scheduled content stay invisible to the public.
revoke all on public.site_media, public.site_banners, public.site_banner_events,
  public.site_home_sections, public.site_nav_items, public.site_categories,
  public.site_content_history
  from anon, authenticated;
grant all on public.site_media, public.site_banners, public.site_banner_events,
  public.site_home_sections, public.site_nav_items, public.site_categories,
  public.site_content_history
  to service_role;

-- Atomic counter bumps for banner events (a read-modify-write in JS would
-- lose counts under concurrent impressions).
create or replace function public.bump_banner_impression(p_banner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.site_banners set impressions = impressions + 1 where id = p_banner;
$$;

create or replace function public.bump_banner_click(p_banner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.site_banners set clicks = clicks + 1 where id = p_banner;
$$;

revoke execute on function public.bump_banner_impression(uuid) from public, anon, authenticated;
revoke execute on function public.bump_banner_click(uuid) from public, anon, authenticated;
grant execute on function public.bump_banner_impression(uuid) to service_role;
grant execute on function public.bump_banner_click(uuid) to service_role;

-- ROLLBACK (run only if this phase is abandoned):
-- drop table if exists public.site_content_history;
-- drop table if exists public.site_banner_events;
-- drop table if exists public.site_categories;
-- drop table if exists public.site_nav_items;
-- drop table if exists public.site_home_sections;
-- drop table if exists public.site_banners;
-- drop table if exists public.site_media;
-- alter table public.product drop column if exists featured, drop column if exists badge_text, drop column if exists sort_weight;
