// Shared date-window check for every scheduling form (banners, home
// sections, promos). The server rejects end <= start, but the form should
// say so before a network round-trip. Inputs are datetime-local strings
// ('' = unset). Returns a human message, or '' when the window is fine.

export const END_BEFORE_START = 'End date must be after start date.'

export function dateWindowError(startsLocal, endsLocal) {
  if (!startsLocal || !endsLocal) return ''
  const s = new Date(startsLocal).getTime()
  const e = new Date(endsLocal).getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return ''
  return e <= s ? END_BEFORE_START : ''
}
