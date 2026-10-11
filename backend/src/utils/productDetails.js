// Validation for product `details`: an ordered array of {label, content}.
// Kept in utils/ so it can be unit tested without pulling in the Supabase
// client, logger, or rate limiter that admin.js depends on.
//
// Deliberately does NOT whitelist labels: storage is already a plain ordered
// array, so admin-defined / reorderable sections (a stated follow-up) are a UI
// change only - no schema or API change.

export const MAX_SECTIONS = 12
export const MAX_LABEL_LENGTH = 80
export const MAX_CONTENT_LENGTH = 4000

/**
 * Normalizes an incoming `details` payload.
 * Returns { value } with a sanitized array (or null when nothing remains) on
 * success, or { error } with a user-facing message when the shape is invalid.
 */
export function sanitizeDetails(value) {
  if (value == null) return { value: null }
  if (!Array.isArray(value)) {
    return { error: 'Product information must be a list of sections' }
  }
  if (value.length > MAX_SECTIONS) {
    return { error: `Product information supports at most ${MAX_SECTIONS} sections` }
  }

  const sections = []
  for (const row of value) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      return { error: 'Each section must be an object with a label and content' }
    }
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    const content = typeof row.content === 'string' ? row.content.trim() : ''

    // a row with no content has nothing to show - drop it rather than store it
    if (!content) continue
    if (!label) return { error: 'Every section needs a label' }
    if (label.length > MAX_LABEL_LENGTH) {
      return { error: `Section labels are limited to ${MAX_LABEL_LENGTH} characters` }
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return { error: `Section content is limited to ${MAX_CONTENT_LENGTH} characters` }
    }
    sections.push({ label, content })
  }

  return { value: sections.length ? sections : null }
}
