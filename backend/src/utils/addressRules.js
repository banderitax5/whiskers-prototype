// Address + phone validation shared by profile and orders.
// Layer-1 rules (owner-approved): PH mobile-only phone numbers (landlines
// deliberately out of scope), address lines that contain letters, 4-digit
// postal codes. Pure structure checks - no third-party API. Province/city
// membership is enforced by the client's selects (philippinesData.js);
// the server validates shape only, which is all it can do without the dataset.

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

export const MSG = {
  phoneInvalid: 'Enter a valid Philippine mobile number (e.g. 0917 123 4567).',
  addressNoLetter: 'Address must contain at least one letter (e.g. a street name).',
  addressTooShort: 'Address must be at least 5 characters.',
  addressNotText: 'Address must be text.',
  postalInvalid: 'Postal code must be exactly 4 digits.',
  placeNoLetter: 'City and province must contain at least one letter.',
  addressRequired: 'Address is required.',
  cityRequired: 'City is required.',
  provinceRequired: 'Province is required.',
  postalRequired: 'Postal code is required.',
}

export function stripControlChars(value) {
  return value.replace(CONTROL_CHARS, ' ')
}

// null/undefined/blank -> null (field simply not provided).
// Otherwise the value must look like a PH mobile number in one of the
// accepted shapes (9XXXXXXXXX, 09XXXXXXXXX, 639XXXXXXXXX, +639...)
// and is normalized to +639XXXXXXXXX. Everything else - including
// landline shapes and digit soup like 12312312312 - is rejected.
export function normalizeMobilePhone(raw) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return { ok: true, value: null, error: null }
  }
  if (typeof raw !== 'string') return { ok: false, value: null, error: MSG.phoneInvalid }
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (!/^\+?\d+$/.test(cleaned)) return { ok: false, value: null, error: MSG.phoneInvalid }
  const digits = cleaned.replace(/^\+/, '')
  let msisdn = null
  if (/^9\d{9}$/.test(digits)) msisdn = digits
  else if (/^09\d{9}$/.test(digits)) msisdn = digits.slice(1)
  else if (/^639\d{9}$/.test(digits)) msisdn = digits.slice(2)
  if (!msisdn) return { ok: false, value: null, error: MSG.phoneInvalid }
  return { ok: true, value: `+63${msisdn}`, error: null }
}

// One address line (street, unit, barangay...). Control characters are
// removed, whitespace collapsed, then the value must contain at least
// one letter and meet the minimum length - so pure-digit junk like
// "123123123" never reaches storage. Empty/null -> null.
export function sanitizeAddressLine(raw, { maxLength = 200 } = {}) {
  if (raw == null) return { ok: true, value: null, error: null }
  if (typeof raw !== 'string') return { ok: false, value: null, error: MSG.addressNotText }
  const cleaned = stripControlChars(raw).replace(/\s+/g, ' ').trim()
  if (!cleaned) return { ok: true, value: null, error: null }
  if (cleaned.length < 5) return { ok: false, value: null, error: MSG.addressTooShort }
  if (!/\p{L}/u.test(cleaned)) return { ok: false, value: null, error: MSG.addressNoLetter }
  return { ok: true, value: cleaned.slice(0, maxLength), error: null }
}

// City / province names: printable, at least one letter, length-capped.
// Membership in the PH dataset is checked by the client's select inputs;
// the server cannot re-check it without duplicating the dataset.
export function sanitizePlaceName(raw, maxLength = 100) {
  if (raw == null) return { ok: true, value: null, error: null }
  if (typeof raw !== 'string') return { ok: false, value: null, error: MSG.placeNoLetter }
  const cleaned = stripControlChars(raw).replace(/\s+/g, ' ').trim()
  if (!cleaned) return { ok: true, value: null, error: null }
  if (!/\p{L}/u.test(cleaned)) return { ok: false, value: null, error: MSG.placeNoLetter }
  return { ok: true, value: cleaned.slice(0, maxLength), error: null }
}

// PH postal codes are exactly 4 digits. Empty/null -> null.
export function sanitizePostalCode(raw) {
  if (raw == null) return { ok: true, value: null, error: null }
  if (typeof raw !== 'string') return { ok: false, value: null, error: MSG.postalInvalid }
  const cleaned = raw.replace(/\s+/g, '')
  if (!cleaned) return { ok: true, value: null, error: null }
  if (!/^\d{4}$/.test(cleaned)) return { ok: false, value: null, error: MSG.postalInvalid }
  return { ok: true, value: cleaned, error: null }
}

// Checkout sends the address as structured fields; this validates each
// one (format + required) and joins them into the single orders.address
// string, in the same order the client used to build it.
export function buildOrderAddress({ addressLine1, addressLine2, city, province, postalCode }) {
  const line1 = sanitizeAddressLine(addressLine1)
  const line2 = sanitizeAddressLine(addressLine2)
  const cityV = sanitizePlaceName(city)
  const provV = sanitizePlaceName(province)
  const postal = sanitizePostalCode(postalCode)
  const failed = [line1, line2, cityV, provV, postal].find((r) => !r.ok)
  if (failed) return { ok: false, value: null, error: failed.error }
  if (!line1.value) return { ok: false, value: null, error: MSG.addressRequired }
  if (!provV.value) return { ok: false, value: null, error: MSG.provinceRequired }
  if (!cityV.value) return { ok: false, value: null, error: MSG.cityRequired }
  if (!postal.value) return { ok: false, value: null, error: MSG.postalRequired }
  const value = [line1.value, line2.value, cityV.value, provV.value, postal.value]
    .filter(Boolean)
    .join(', ')
  return { ok: true, value, error: null }
}
