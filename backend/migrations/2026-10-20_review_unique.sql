-- Unique constraint for reviews: one review per (order_id, prod_id)
-- Enables upsert with onConflict in feedback.js
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_order_prod_unique'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT feedback_order_prod_unique
      UNIQUE (order_id, prod_id);
  END IF;
END $$;

-- Rollback:
-- ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_order_prod_unique;