// Helpers for TOTP input handling. Kept dependency-free so login, enrollment
// and profile screens share exactly the same validation.

export const OTP_LENGTH = 6

// Digits only, capped at six characters. Users routinely paste codes with a
// space ("123 456"), so paste-friendly normalization matters.
export function normalizeOtp(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export function isOtpComplete(value) {
  return normalizeOtp(value).length === OTP_LENGTH
}

export function otpError(value) {
  if (!String(value ?? '').trim()) return 'Enter the 6-digit code from your authenticator app.'
  if (!isOtpComplete(value)) return 'The code must be exactly 6 digits.'
  return ''
}

// Supabase returns the TOTP QR as raw <svg> markup in this project (not a data
// URI), which an <img src> cannot display - the browser shows a broken image
// with only the alt text. Wrap it in a data URI; anything already usable (a
// data: URI or a plain URL) is passed through untouched.
export function qrImageSrc(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  if (/^data:/i.test(raw)) return raw
  if (raw.startsWith('<')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`
  return raw
}
