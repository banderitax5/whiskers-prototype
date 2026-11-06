-- 2026-11-06_pets_allergies_lamb.sql
--
-- A pet with the "lamb" allergy could not be saved. The live pets table was
-- created before lamb was added to the list, so its check constraint refuses
-- the value even though the form offers it and the API accepts it.
--
-- Why a separate migration: 2026-11-05_pets.sql starts with
-- "create table if not exists", so editing it does nothing to a table that
-- already exists - the old constraint stays. Fresh installs already get lamb
-- from that file, so this migration is a harmless no-op there.
--
-- Owner action: paste this into the Supabase SQL editor and run it once.
-- While the old constraint is live, saving a lamb allergy answers
-- 500 "Could not save this pet. Please try again."

do $$
declare
  c record;
begin
  -- the table may not exist yet on a database that skipped 2026-11-05
  if to_regclass('public.pets') is null then
    raise notice 'public.pets does not exist; run 2026-11-05_pets.sql first';
    return;
  end if;

  -- Find every check constraint that touches the allergies column, whatever it
  -- was called (the inline column check got the auto-name pets_allergies_check,
  -- but a hand-made constraint could be named differently). conkey holds column
  -- numbers, so compare against the current attnum of "allergies".
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.conrelid = 'public.pets'::regclass
      and con.contype = 'c'
      and att.attname = 'allergies'
  loop
    execute format('alter table public.pets drop constraint %I', c.conname);
  end loop;

  -- One list, matching backend/src/utils/petProfile.js ALLERGIES and the form.
  -- "" is the empty array (no allergy), which the column already allows.
  alter table public.pets
    add constraint pets_allergies_check check (
      allergies <@ array['chicken', 'beef', 'lamb', 'fish', 'grain', 'dairy', 'egg']::text[]
    );
end $$;

-- Rollback (only if lamb must be refused again; pets already saved with it
-- would make this fail until those rows are cleared):
-- alter table public.pets drop constraint if exists pets_allergies_check;
-- alter table public.pets
--   add constraint pets_allergies_check check (allergies <@ array[
--     'chicken', 'beef', 'fish', 'grain', 'dairy', 'egg'
--   ]::text[]);
