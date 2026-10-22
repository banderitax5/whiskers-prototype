-- Idempotency key for orders (allows safe retry of order creation)
-- Add nullable column + partial unique index (only non-null keys)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS orders_idempotency_key_idx;
-- ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key;