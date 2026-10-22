-- Fix: category-scope promos could never be saved
--
-- promos.target_id was created as uuid, but the promo engine compares
-- target_id against the product's CATEGORY NAME for scope = 'category'
-- (promoEngine.scopeMatches: items.some(i => i.category === target_id)).
-- Storing a name failed with 22P02 "invalid input syntax for type uuid",
-- so the admin UI could only ever create product-scope promos (prod_id is a
-- real uuid). Proven live: POST with target_id 'Dogs' -> 400/22P02.
--
-- Fix: widen the column to text. Product scope keeps storing uuids (as
-- text), category scope stores the category name the engine expects.
-- No API contract changes; the admin dropdown now stores real names.
--
-- Owner: run this in the Supabase SQL editor. No code deploy needed.
--
-- Rollback:
--   ALTER TABLE promos ALTER COLUMN target_id TYPE uuid USING (target_id::uuid);
--   -- NOTE: rollback fails if any category-name rows exist; delete those
--   -- category-scope promos first, then run the line above.

ALTER TABLE promos ALTER COLUMN target_id TYPE text USING (target_id::text);

COMMENT ON COLUMN promos.target_id IS
  'scope=sitewide: null; scope=category: product.category name (text); scope=product: product.prod_id uuid stored as text';
