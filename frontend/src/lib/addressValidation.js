// Address + phone validation for checkout and profile forms.
// Mirrors backend/src/utils/addressRules.js: PH mobile-only phone numbers
// (landlines out of scope), address lines that contain letters, 4-digit
// postal codes. Province/city membership comes from the select inputs
// (philippinesData.js), so only format rules live here.

const PHONE_REQUIRED_MSG = 'Phone number is required.'
const PHONE_INVALID_MSG = 'Enter a valid Philippine mobile number (e.g. 0917 123 4567).'
const ADDRESS_REQUIRED_MSG = 'Address is required.'
const ADDRESS_TOO_SHORT_MSG = 'Address must be at least 5 characters.'
const ADDRESS_NO_LETTER_MSG = 'Address must contain at least one letter (e.g. a street name).'
const POSTAL_REQUIRED_MSG = 'Postal code is required.'
const POSTAL_INVALID_MSG = 'Postal code must be exactly 4 digits.'

export const ADDRESS_MESSAGES = {
  phoneRequired: PHONE_REQUIRED_MSG,
  phoneInvalid: PHONE_INVALID_MSG,
  addressRequired: ADDRESS_REQUIRED_MSG,
  addressTooShort: ADDRESS_TOO_SHORT_MSG,
  addressNoLetter: ADDRESS_NO_LETTER_MSG,
  postalRequired: POSTAL_REQUIRED_MSG,
  postalInvalid: POSTAL_INVALID_MSG,
}

// '' when valid, otherwise the message to show. Accepts the same shapes
// as the server: 09171234567 / +639171234567 / 639... / 9..., separators
// allowed - and rejects everything else (digit soup, landlines).
export function phoneError(value, { required = true } = {}) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return required ? PHONE_REQUIRED_MSG : ''
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (!/^\+?\d+$/.test(cleaned)) return PHONE_INVALID_MSG
  const digits = cleaned.replace(/^\+/, '')
  const valid = /^9\d{9}$/.test(digits) || /^09\d{9}$/.test(digits) || /^639\d{9}$/.test(digits)
  return valid ? '' : PHONE_INVALID_MSG
}

export function addressLineError(value, { required = false } = {}) {
  const raw = (value ?? '').toString()
  // eslint-disable-next-line no-control-regex -- control chars are exactly what we strip
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return required ? ADDRESS_REQUIRED_MSG : ''
  if (cleaned.length < 5) return ADDRESS_TOO_SHORT_MSG
  if (!/\p{L}/u.test(cleaned)) return ADDRESS_NO_LETTER_MSG
  return ''
}

export function postalError(value, { required = false } = {}) {
  const cleaned = (value ?? '').toString().replace(/\s+/g, '')
  if (!cleaned) return required ? POSTAL_REQUIRED_MSG : ''
  return /^\d{4}$/.test(cleaned) ? '' : POSTAL_INVALID_MSG
}
