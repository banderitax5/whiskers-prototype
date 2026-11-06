-- 2026-11-06_pets_lifestyle.sql
--
-- Pet profiles gained three daily-life answers:
--   activity    - low / normal / high (dog and cat)
--   environment - indoor / outdoor / both (cat only)
--   breed_size  - small / medium / large / unknown (dog only)
--
-- They are soft hints for the recommendation order, never medical facts. A dog
-- that is very active is shown energy-dense formulas first, a calm pet is shown
-- lighter ones, and an indoor cat is shown indoor and hairball formulas first.
--
-- Why not put these on one JSON column: each answer is checked against its own
-- short list, so a bad value can never reach the engine and the three questions
-- can be filtered or counted with plain SQL later.
--
-- Why every column is NOT NULL with a default: the table already holds pets
-- saved before these questions existed. The default is the neutral answer, so
-- those rows read exactly as they did before and no backfill is needed.
--
-- Owner action: paste this into the Supabase SQL editor and run it once, AFTER
-- 2026-11-05_pets.sql. The app keeps working without it (signed-in pets fall
-- back to on-device storage with a notice until it runs).

alter table public.pets
  add column if not exists activity text not null default 'normal',
  add column if not exists environment text not null default 'both',
  add column if not exists breed_size text not null default 'unknown';

-- The ADD COLUMN IF NOT EXISTS above never re-adds a constraint to a column it
-- already added, so the checks are guarded separately. Each pair is written to
-- be safe to run twice.
do $$
begin
  -- the table is named too: a check constraint name is only unique per table,
  -- so conname alone could match an unrelated table and skip the real one
  if not exists (
    select 1 from pg_constraint
    where conname = 'pets_activity_check' and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
      add constraint pets_activity_check check (activity in ('low', 'normal', 'high'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pets_environment_check' and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
      add constraint pets_environment_check check (environment in ('indoor', 'outdoor', 'both'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pets_breed_size_check' and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
      add constraint pets_breed_size_check check (breed_size in ('small', 'medium', 'large', 'unknown'));
  end if;
end $$;

comment on column public.pets.activity is
  'Daily activity: low, normal or high. A soft hint for the recommendation order.';
comment on column public.pets.environment is
  'Where a cat lives: indoor, outdoor or both. Neutral "both" for other species.';
comment on column public.pets.breed_size is
  'Adult breed size: small, medium, large or unknown. Neutral "unknown" for cats.';

-- Rollback:
-- alter table public.pets drop constraint if exists pets_activity_check;
-- alter table public.pets drop constraint if exists pets_environment_check;
-- alter table public.pets drop constraint if exists pets_breed_size_check;
-- alter table public.pets drop column if exists activity;
-- alter table public.pets drop column if exists environment;
-- alter table public.pets drop column if exists breed_size;
