-- Allow the new "brand" banner link choice
--
-- site_banners.link_type was created with an inline CHECK that only knew
-- ('none','product','category','promo','url'). The admin UI and server now
-- also support 'brand' (banner -> /menu?brand=Name), so the constraint has
-- to widen. Without this, saving a brand-linked banner fails at insert time
-- with 23514 / "Failed to update banner".
--
-- Owner: run this in the Supabase SQL editor, then restart the backend
-- (kill node on port 4141, start it again). The E2E brand step flips from
-- SKIP to PASS on the next run.
--
-- Rollback:
--   ALTER TABLE site_banners DROP CONSTRAINT site_banners_link_type_check;
--   ALTER TABLE site_banners ADD CONSTRAINT site_banners_link_type_check
--     CHECK (link_type IN ('none','product','category','promo','url'));

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'site_banners'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%link_type%'
  LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE site_banners DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE site_banners ADD CONSTRAINT site_banners_link_type_check
  CHECK (link_type IN ('none', 'product', 'category', 'brand', 'promo', 'url'));

COMMENT ON CONSTRAINT site_banners_link_type_check ON site_banners IS
  'Banner destinations: none, product, category, brand, promo, url (brand added 2026-10-14)';
