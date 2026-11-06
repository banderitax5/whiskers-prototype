-- Real-time storefront content (owner-run migration; additive only).
--
-- WHAT THIS DOES
--   Creates one tiny public table, public.site_content_version, that holds a
--   single counter row. Browsers watch that row over Supabase Realtime; when
--   the counter changes they re-fetch GET /api/site-content. No storefront
--   content (drafts, schedules, settings, promo codes) is ever sent over the
--   socket - only a number.
--
--   Row triggers bump the counter whenever an owner-edited content table
--   changes, so admin saves, the history restore button and manual SQL edits
--   in the Supabase dashboard all reach open storefronts without a refresh.
--
--   Counter-only writes are ignored (banner impressions/clicks, promo
--   redemption counts) so ordinary shopper traffic cannot wake every tab.
--
-- RUN THIS ONCE in the Supabase SQL editor. Safe to re-run.
-- If it is not applied the site keeps working exactly as before: no live
-- pushes, edits appear on the next navigation, as they do today.
--
-- ROLLBACK (only if the feature is abandoned):
--   drop trigger if exists site_content_version_bump on public.site_banners;
--   drop trigger if exists site_content_version_bump on public.site_home_sections;
--   drop trigger if exists site_content_version_bump on public.site_nav_items;
--   drop trigger if exists site_content_version_bump on public.site_categories;
--   drop trigger if exists site_content_version_bump on public.site_settings;
--   drop trigger if exists site_content_version_bump on public.site_faqs;
--   drop trigger if exists site_content_version_bump on public.site_policies;
--   drop trigger if exists site_content_version_bump on public.promos;
--   drop function if exists public.bump_site_content_version();
--   do $$ begin
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime'
--                  and schemaname = 'public'
--                  and tablename = 'site_content_version') then
--       alter publication supabase_realtime drop table public.site_content_version;
--     end if;
--   end $$;
--   drop table if exists public.site_content_version;

-- ── 1. the single counter row ───────────────────────────────────────────────
create table if not exists public.site_content_version (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.site_content_version (id, version)
values (1, 1)
on conflict (id) do nothing;

alter table public.site_content_version enable row level security;
alter table public.site_content_version replica identity full;

drop policy if exists site_content_version_public_read on public.site_content_version;
create policy site_content_version_public_read
  on public.site_content_version
  for select
  to anon, authenticated
  using (true);

revoke all on public.site_content_version from anon, authenticated;
grant select on public.site_content_version to anon, authenticated;
grant all on public.site_content_version to service_role;

-- ── 2. bump function ────────────────────────────────────────────────────────
create or replace function public.bump_site_content_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if tg_op = 'UPDATE' then
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);

    -- these columns move on every shopper action; they are not content
    if tg_table_name = 'site_banners' then
      before_row := before_row - 'impressions' - 'clicks';
      after_row := after_row - 'impressions' - 'clicks';
    elsif tg_table_name = 'promos' then
      before_row := before_row - 'usage_count';
      after_row := after_row - 'usage_count';
    end if;

    if before_row = after_row then
      return null;
    end if;
  end if;

  update public.site_content_version
     set version = version + 1,
         updated_at = now()
   where id = 1;

  return null;
end;
$$;

revoke all on function public.bump_site_content_version() from public, anon, authenticated;

-- ── 3. one trigger per content table (skip tables this database lacks) ──────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'site_banners',
    'site_home_sections',
    'site_nav_items',
    'site_categories',
    'site_settings',
    'site_faqs',
    'site_policies',
    'promos'
  ] loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format('drop trigger if exists site_content_version_bump on public.%I', tbl);
      execute format(
        'create trigger site_content_version_bump after insert or update or delete on public.%I for each row execute function public.bump_site_content_version()',
        tbl
      );
    end if;
  end loop;
end $$;

-- ── 4. let Realtime broadcast the counter row ───────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'site_content_version'
     ) then
    execute 'alter publication supabase_realtime add table public.site_content_version';
  end if;
end $$;
