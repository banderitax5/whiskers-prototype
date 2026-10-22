// helpers for PostgREST/PostgreSQL error shapes, shared by the public and
// admin product routes so schema-mismatch handling lives in one place.

// PostgREST/PGRST and plain SQL both name the offending column, but the wording
// differs, so match either shape before deciding this is a missing-column error.
// returns the missing column name when it is one of the candidates, else null.
export function missingColumnOf(err, candidates) {
  const text = `${err?.message || ''} ${err?.details || ''}`
  if (!/does not exist|could not find the .* column|PGRST204/i.test(text)) return null
  let m = text.match(/'([^']+)' column of/i) || text.match(/column\s+(?:[\w"]+\.)?([\w"]+)\s+does not exist/i)
  if (m && candidates.includes(m[1])) return m[1]
  return candidates.find((c) => text.includes(c)) || candidates[0]
}

// true when an error means "the database has not run this migration yet":
// unknown column (PGRST204), unknown table (PGRST205/42P01), or plain SQL
// "does not exist". Used to answer 503 MIGRATION_REQUIRED instead of 500.
export function isSchemaPendingError(err) {
  const code = err?.code || ''
  if (code === 'PGRST204' || code === 'PGRST205' || code === '42P01') return true
  const text = `${err?.message || ''} ${err?.details || ''}`
  return /does not exist|could not find the .* column|not find the table/i.test(text)
}
