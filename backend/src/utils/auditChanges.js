// Sanitizer for the optional `changes` payload on audit rows: a
// { field: { from, to } } map (usually produced by diffChanges in
// contentHistory.js) describing exactly which values an admin action moved.
// The audit write itself is best-effort, but a bad payload must never bloat
// the table or break the insert, so everything is clamped here:
//   - plain objects only, max 20 fields (diff order = field order, first win)
//   - field names <= 80 chars
//   - from/to values are JSON scalars; arrays/objects are stringified and
//     truncated; long strings truncated to 300 chars
// Returns null when there is nothing worth storing.

const MAX_FIELDS = 20
const MAX_KEY = 80
const MAX_VALUE = 300

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function clampValue(v) {
  if (v === undefined) return null
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return v
  if (typeof v === 'string') {
    return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE)}...` : v
  }
  // arrays / objects / dates-as-strings-that-came-through-json: one readable line
  let text
  try {
    text = JSON.stringify(v)
  } catch {
    return null
  }
  if (text === undefined) return null
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}...` : text
}

export function sanitizeChanges(input) {
  if (!isPlainObject(input)) return null
  const out = {}
  let kept = 0
  for (const [rawKey, rawVal] of Object.entries(input)) {
    if (kept >= MAX_FIELDS) break
    const key = String(rawKey).slice(0, MAX_KEY)
    if (!key) continue
    if (!isPlainObject(rawVal)) {
      // tolerate a bare value (treat as { from: null, to: value })
      const to = clampValue(rawVal)
      if (to === null) continue
      out[key] = { from: null, to }
      kept += 1
      continue
    }
    const from = clampValue(rawVal.from)
    const to = clampValue(rawVal.to)
    if (from === null && to === null) continue
    out[key] = { from, to }
    kept += 1
  }
  return Object.keys(out).length > 0 ? out : null
}
