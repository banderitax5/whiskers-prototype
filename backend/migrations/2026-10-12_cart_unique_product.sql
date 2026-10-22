-- 2026-10-12: kill duplicate cart rows per (user, product)
--
-- The app merges duplicate adds with a select-then-insert, which can still
-- race under concurrent requests and produce two rows for the same product.
-- This migration (1) folds any existing duplicates into a single row and
-- (2) adds a unique index so the race can never persist a duplicate again.
--
-- The backend's POST /api/cart already handles the unique-violation (23505)
-- by merging into the surviving row, so no deploy coordination is needed.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR. Safe to re-run (idempotent).

-- 1) fold duplicates: keep the oldest row per (user_id, product_id),
--    sum the quantities of the rows being dropped
WITH ranked AS (
  SELECT id,
         user_id,
         product_id,
         quantity,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, product_id
           ORDER BY created_at ASC, id ASC
         ) AS rn,
         SUM(quantity) OVER (
           PARTITION BY user_id, product_id
         ) AS total_qty
  FROM cart_items
),
keepers AS (
  UPDATE cart_items
  SET quantity = ranked.total_qty
  FROM ranked
  WHERE cart_items.id = ranked.id
    AND ranked.rn = 1
    AND ranked.total_qty <> cart_items.quantity
  RETURNING cart_items.id
)
DELETE FROM cart_items
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- 2) one cart row per user per product from now on
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_id_product_id_key
  ON cart_items (user_id, product_id);
