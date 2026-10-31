// One place for the wording users read when a request fails.
//
// A server message always wins (it knows what actually happened), but these
// fill the gaps so nobody ever sees "HTTP 500", "Failed to fetch" or a raw
// JSON parse error. Keep the copy plain: say what happened and what to do next.

export const NETWORK_MESSAGE =
  "We can't reach the server right now. Check your internet connection and try again."

export const DEFAULT_MESSAGE = 'Something went wrong. Please try again in a moment.'

const STATUS_MESSAGES = {
  400: 'We could not complete that request. Check the details and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to do that.",
  404: 'We could not find that. It may have been removed.',
  408: 'That took too long to load. Check your connection and try again.',
  409: 'That change conflicts with something else. Refresh the page and try again.',
  413: 'That file is too large. Please choose a smaller one.',
  415: 'That file type is not supported. Please choose an image.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again in a moment.',
  502: 'The server is not responding right now. Please try again in a moment.',
  503: 'The service is briefly unavailable. Please try again in a moment.',
  504: 'The server took too long to answer. Please try again in a moment.',
}

// Messages that are really transport/parser noise rather than something a
// shopper or shop owner can act on.
const TECHNICAL = [
  /^HTTP \d{3}$/i,
  /failed to fetch/i,
  /load failed/i,
  /network ?error/i,
  /^network request/i,
  /unexpected token/i,
  /is not valid json/i,
  /json\.parse/i,
  /cannot read propert/i,
  /is not a function/i,
  /^undefined is not/i,
  /^timeout/i,
  /aborted/i,
  /\bECONN(REFUSED|RESET)\b|\bETIMEDOUT\b|\bENOTFOUND\b/,
]

export function messageForStatus(status, fallback = DEFAULT_MESSAGE) {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
  if (typeof status === 'number' && status >= 500) return STATUS_MESSAGES[500]
  return fallback
}

export function isNetworkError(err) {
  if (!err) return false
  if (typeof err === 'object' && err.name === 'TypeError' && /fetch/i.test(String(err.message || ''))) return true
  const msg = typeof err === 'string' ? err : err.message
  return /failed to fetch|load failed|network ?error|network request/i.test(String(msg || ''))
}

function isTechnicalMessage(msg) {
  return TECHNICAL.some((re) => re.test(msg))
}

/**
 * Turn any thrown value into copy a person can understand.
 * Server-written messages are kept as-is; technical noise is replaced.
 */
export function friendlyMessage(err, fallback = DEFAULT_MESSAGE) {
  if (!err) return fallback
  if (isNetworkError(err)) return NETWORK_MESSAGE
  const status = typeof err === 'object' ? err.status : undefined
  const msg = typeof err === 'string' ? err : err.message
  const text = typeof msg === 'string' ? msg.trim() : ''
  if (!text || isTechnicalMessage(text)) return messageForStatus(status, fallback)
  return text
}

/**
 * Build the Error thrown for a failed fetch response.
 * `data` is the parsed JSON body, which usually carries { error, code }.
 */
export function errorFromResponse(res, data = {}, fallback = DEFAULT_MESSAGE) {
  const raw = typeof data?.error === 'string' ? data.error.trim() : ''
  const text = raw && !isTechnicalMessage(raw) ? raw : messageForStatus(res.status, fallback)
  const err = new Error(text)
  err.status = res.status
  err.code = data?.code
  return err
}
