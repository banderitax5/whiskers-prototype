-- 2026-11-05_pets.sql
--
-- Pet profiles move from the browser to the server. Until now every profile
-- lived in localStorage, so it was lost when the browser data was cleared and
-- never followed the owner to another device. This table gives each account
-- its own pets.
--
-- Why a table and not JSON on profiles:
--   - one row per pet, so adding or removing one never rewrites the others
--   - CHECK constraints keep species/stage/condition/allergy values honest
--   - a future per-condition report (counts, trends) is a simple SQL query
--
-- Access: the backend owns every write (service_role), like cart_items and
-- orders. The browser may only READ its own rows through RLS, so a leaked
-- anon key cannot insert or edit a pet.
--
-- Owner action: paste this into the Supabase SQL editor and run it once.
-- The app keeps working without it (guests stay on-device, and signed-in
-- saves answer 503 "waiting on a database update" until it is run).

create table if not exists public.pets (
  pet_id          uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 40),
  species         text not null check (species in ('dog', 'cat', 'bird', 'fish')),
  life_stage      text not null check (life_stage in ('puppy', 'kitten', 'juvenile', 'adult', 'senior')),
  stage_source    text not null default 'manual' check (stage_source in ('birthDate', 'manual')),
  birth_date      date,
  weight_kg       numeric(5, 2) check (weight_kg is null or (weight_kg >= 0.1 and weight_kg <= 200)),
  neutered        text not null default 'unknown' check (neutered in ('unknown', 'yes', 'no')),
  health_condition text not null default 'healthy' check (health_condition in (
    'healthy', 'diabetes', 'kidney', 'urinary', 'sensitive-stomach',
    'allergy-prone', 'weight-management', 'dental', 'joint', 'heart', 'liver'
  )),
  -- only real allergens are stored; "none / not sure" is the empty array.
  allergies       text[] not null default '{}' check (allergies <@ array[
    'chicken', 'beef', 'lamb', 'fish', 'grain', 'dairy', 'egg'
  ]::text[]),
  -- Daily-life answers: soft hints for the recommendation order, not medical
  -- facts. The neutral answer is the default, so a profile saved before these
  -- questions existed behaves exactly as it did.
  activity        text not null default 'normal' check (activity in ('low', 'normal', 'high')),
  environment     text not null default 'both' check (environment in ('indoor', 'outdoor', 'both')),
  breed_size      text not null default 'unknown' check (breed_size in ('small', 'medium', 'large', 'unknown')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- the pets page always loads one account's pets in the order they were added
create index if not exists pets_user_created_idx on public.pets (user_id, created_at);

alter table public.pets enable row level security;

-- The owner may read their own pets (the backend uses the user's token for
-- reads, so a missing policy would hide the list). Writes are revoked below.
drop policy if exists "pets: owner reads own rows" on public.pets;
create policy "pets: owner reads own rows"
  on public.pets for select
  using (auth.uid() = user_id);

revoke insert, update, delete, truncate on public.pets from public, anon, authenticated;
grant select on public.pets to authenticated;
grant all on public.pets to service_role;

-- rollback:
-- drop table if exists public.pets;
