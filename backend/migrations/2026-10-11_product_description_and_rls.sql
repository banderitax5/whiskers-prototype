-- ============================================================================
-- Migration: product description + tighten public product read policy
-- Owner-approved (Q1 + Q2) on 2026-10-11. Run this in the Supabase SQL editor.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- ORDERING: run this BEFORE relying on the admin "Description" field or the
-- product detail page's description block. The public GET /api/products/:id
-- endpoint already falls back gracefully if `description` is absent, so the
-- customer-facing page keeps working either way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Q1: optional product description shown on the product detail page.
--    Nullable, so existing rows are unaffected and no backfill is needed.
-- ---------------------------------------------------------------------------
ALTER TABLE product ADD COLUMN IF NOT EXISTS description text;

-- ---------------------------------------------------------------------------
-- 2) Q2: the public SELECT policy was `true`, which let anyone fetch inactive
--    products straight from the REST API with the anon key. Restrict public
--    read to active products only; admins still see everything because admin
--    CRUD uses the service_role (which bypasses RLS) and is_admin() is honored
--    here for good measure.
--
--    NOTE: the policy is named from the capstone ERD. If you get an error that
--    the policy doesn't exist, run the check below first and substitute the
--    real name:
--      SELECT policyname, cmd, qual FROM pg_policies
--      WHERE tablename = 'product' AND cmd = 'SELECT';
--    Postgres ORs together permissive policies, so if a *differently named*
--    public `true` policy also exists, drop that one too or it will keep
--    exposing inactive rows.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access for products" ON product;

CREATE POLICY "Public read access for products" ON product
  FOR SELECT
  USING (is_active = true OR is_admin());
