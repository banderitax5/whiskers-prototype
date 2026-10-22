-- Atomic promo usage increment with limit check
-- Call: SELECT * FROM atomic_promo_increment('PROMO_CODE');
-- Returns one row when reserved; zero rows when the usage limit is reached.
-- DROP first: CREATE OR REPLACE cannot change an existing function's OUT row type.
DROP FUNCTION IF EXISTS atomic_promo_increment(text);
CREATE FUNCTION atomic_promo_increment(p_code text)
RETURNS TABLE (promo_code text, new_usage_count int) AS $$
BEGIN
  RETURN QUERY
  UPDATE promos p
  SET usage_count = p.usage_count + 1,
      updated_at = now()
  WHERE p.code = p_code
    AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
  RETURNING p.code, p.usage_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role (the backend uses service_role)
GRANT EXECUTE ON FUNCTION atomic_promo_increment(text) TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS atomic_promo_increment(text);