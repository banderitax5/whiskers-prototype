-- Phase 6: site settings, FAQs, and policy pages (owner-run; additive only).
-- Three new tables. No existing column is renamed, retyped, or dropped.
-- Rollback at the bottom.
--
-- site_settings is a single JSONB row (id = 1). Keys are validated and
-- grouped in backend/src/utils/siteSettingsRules.js; the public payload is
-- filtered server-side so admin-only keys (thresholds) never reach anon.
-- Public read happens ONLY through GET /api/site-content - like the promos
-- table, site_settings itself is service-role only (codes/settings must not
-- be enumerable by the anon key).

create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
-- no policies: service_role bypasses RLS, anon/authenticated get nothing

create table if not exists public.site_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists site_faqs_order_idx
  on public.site_faqs (sort_order) where archived_at is null;

alter table public.site_faqs enable row level security;
-- no policies: reads go through the backend (service_role)

create table if not exists public.site_policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null default '',
  is_visible boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.site_policies enable row level security;
-- no policies: reads go through the backend (service_role)

-- harden like the Phase 5 tables: revoke everything from the API roles
revoke all on public.site_settings from anon, authenticated;
revoke all on public.site_faqs from anon, authenticated;
revoke all on public.site_policies from anon, authenticated;

-- ── ROLLBACK (run only if this phase is abandoned) ───────────────────────────
-- drop table if exists public.site_policies;
-- drop table if exists public.site_faqs;
-- drop table if exists public.site_settings;
