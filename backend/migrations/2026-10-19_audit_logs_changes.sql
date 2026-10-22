-- Phase B: structured before/after values on audit rows.
-- The admin Audit Logs page renders exact diffs ("price 265 -> 299") from
-- this column; older rows simply have NULL and keep their sentence-only view.
--
-- Run in: Supabase SQL editor (owner-run; the backend tolerates its absence
-- by dropping the changes payload and still writing the audit row).
-- After running: restart the backend on :4141 (habit; nothing caches this),
-- then re-run the E2E suite - the audit-changes step flips SKIP -> PASS.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes jsonb;

-- No index: the page reads newest-N rows ordered by created_at; nothing
-- filters on changes.
--
-- Rollback:
--   ALTER TABLE audit_logs DROP COLUMN IF EXISTS changes;
