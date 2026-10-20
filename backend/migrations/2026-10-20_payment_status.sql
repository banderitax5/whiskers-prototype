-- Simulated payment gateway: payment lifecycle columns (OWNER-RUN).
-- Run in the Supabase SQL editor, then restart the backend on :4141.
--
-- payment.status is the paid/pending/failed/expired truth for cashless
-- methods (GCash, PayMaya). COD keeps its method-based display and is
-- recorded 'succeeded': nothing is outstanding - the cash is collected on
-- delivery, per the paper's flow.
--
-- Existing rows are backfilled 'succeeded': every row predates the gateway
-- and the shop treated a recorded payment as final (receipt was sent at
-- order creation for all methods until now).
--
-- Pre-migration behavior (safe to deploy code first):
--   * order creation sheds the new columns - checkout still works
--   * order/admin payment reads fall back to the base columns
--   * POST /api/orders/:id/simulate-payment answers 503 MIGRATION_REQUIRED
--   * the expiry sweep still cancels + restocks (order-level truth works);
--     only the payment.status 'expired' mark is skipped (logged, best-effort)

ALTER TABLE payment ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE payment ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS gateway_ref text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_status_check'
  ) THEN
    ALTER TABLE payment ADD CONSTRAINT payment_status_check
      CHECK (status IN ('pending', 'succeeded', 'failed', 'expired'));
  END IF;
END $$;

UPDATE payment SET status = 'succeeded' WHERE status = 'pending';

-- Rollback:
--   ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_status_check;
--   ALTER TABLE payment DROP COLUMN IF EXISTS status;
--   ALTER TABLE payment DROP COLUMN IF EXISTS paid_at;
--   ALTER TABLE payment DROP COLUMN IF EXISTS gateway_ref;
