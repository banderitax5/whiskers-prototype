// shared UUID v4 validation used to gate :id route params before they reach
// the database. A malformed id short-circuits to 404 without a query.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return UUID_RE.test(String(value || '').trim())
}
