import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeMobilePhone,
  sanitizeAddressLine,
  sanitizePlaceName,
  sanitizePostalCode,
  buildOrderAddress,
  MSG,
} from '../src/utils/addressRules.js'

test('normalizeMobilePhone accepts PH mobile shapes and normalizes them', () => {
  assert.deepEqual(normalizeMobilePhone('09171234567'), { ok: true, value: '+639171234567', error: null })
  assert.equal(normalizeMobilePhone('0917 123 4567').value, '+639171234567')
  assert.equal(normalizeMobilePhone('0917-123-4567').value, '+639171234567')
  assert.equal(normalizeMobilePhone('(0917) 123 4567').value, '+639171234567')
  assert.equal(normalizeMobilePhone('+639171234567').value, '+639171234567')
  assert.equal(normalizeMobilePhone('639171234567').value, '+639171234567')
  assert.equal(normalizeMobilePhone('9171234567').value, '+639171234567')
})

test('normalizeMobilePhone rejects junk and non-mobile shapes', () => {
  for (const bad of ['12312312312', '12345', '0288888888', '02-8888-8888', '091712345678', 'abc', '917', '+63917123456']) {
    const res = normalizeMobilePhone(bad)
    assert.equal(res.ok, false, `expected reject for ${bad}`)
    assert.equal(res.error, MSG.phoneInvalid)
  }
  assert.equal(normalizeMobilePhone(12345).ok, false)
})

test('normalizeMobilePhone treats empty input as not provided', () => {
  assert.deepEqual(normalizeMobilePhone(null), { ok: true, value: null, error: null })
  assert.deepEqual(normalizeMobilePhone(undefined), { ok: true, value: null, error: null })
  assert.deepEqual(normalizeMobilePhone(''), { ok: true, value: null, error: null })
  assert.deepEqual(normalizeMobilePhone('   '), { ok: true, value: null, error: null })
})

test('sanitizeAddressLine rejects pure-digit junk', () => {
  assert.equal(sanitizeAddressLine('123123123').ok, false)
  assert.equal(sanitizeAddressLine('123123123').error, MSG.addressNoLetter)
  assert.equal(sanitizeAddressLine('123456789012345').ok, false)
  assert.equal(sanitizeAddressLine('1234').error, MSG.addressTooShort)
  assert.equal(sanitizeAddressLine('abc').ok, false)
  assert.equal(sanitizeAddressLine(5).ok, false)
})

test('sanitizeAddressLine accepts real-looking addresses', () => {
  assert.deepEqual(sanitizeAddressLine('1 Test Street'), { ok: true, value: '1 Test Street', error: null })
  assert.equal(sanitizeAddressLine('Blk 3 Sampaguita St.').value, 'Blk 3 Sampaguita St.')
  assert.equal(sanitizeAddressLine('  Unit 4B, Rizal Ave.  ').value, 'Unit 4B, Rizal Ave.')
  assert.equal(sanitizeAddressLine('Purok 4, Sitio Riverside').value, 'Purok 4, Sitio Riverside')
})

test('sanitizeAddressLine strips control characters and collapses whitespace', () => {
  assert.equal(sanitizeAddressLine('Line1\n\rLine2  St').value, 'Line1 Line2 St')
  assert.equal(sanitizeAddressLine('Blk\u0000 1 Sampaguita').value, 'Blk 1 Sampaguita')
  assert.equal(sanitizeAddressLine(' 1 Test St ').value, '1 Test St')
})

test('sanitizeAddressLine: empty means not provided, long values are capped at 200', () => {
  assert.deepEqual(sanitizeAddressLine(null), { ok: true, value: null, error: null })
  assert.deepEqual(sanitizeAddressLine(''), { ok: true, value: null, error: null })
  assert.deepEqual(sanitizeAddressLine('   '), { ok: true, value: null, error: null })
  const long = 'Street ' + 'a'.repeat(300)
  const res = sanitizeAddressLine(long)
  assert.equal(res.ok, true)
  assert.equal(res.value.length, 200)
})

test('sanitizePostalCode requires exactly 4 digits', () => {
  assert.deepEqual(sanitizePostalCode('1234'), { ok: true, value: '1234', error: null })
  assert.equal(sanitizePostalCode(' 1800 ').value, '1800')
  assert.equal(sanitizePostalCode('123').ok, false)
  assert.equal(sanitizePostalCode('abcd').ok, false)
  assert.equal(sanitizePostalCode('12345').ok, false)
  assert.equal(sanitizePostalCode('12ab').error, MSG.postalInvalid)
  assert.deepEqual(sanitizePostalCode(null), { ok: true, value: null, error: null })
  assert.deepEqual(sanitizePostalCode(''), { ok: true, value: null, error: null })
})

test('sanitizePlaceName requires a letter', () => {
  assert.deepEqual(sanitizePlaceName('Marikina City'), { ok: true, value: 'Marikina City', error: null })
  assert.equal(sanitizePlaceName('  Antipolo ').value, 'Antipolo')
  assert.equal(sanitizePlaceName('123123').ok, false)
  assert.equal(sanitizePlaceName('123123').error, MSG.placeNoLetter)
  assert.deepEqual(sanitizePlaceName(undefined), { ok: true, value: null, error: null })
})

test('buildOrderAddress joins valid structured fields in client order', () => {
  const res = buildOrderAddress({
    addressLine1: 'Blk 3 Sampaguita St.',
    addressLine2: 'Unit 4B',
    city: 'Marikina City',
    province: 'Metro Manila',
    postalCode: '1800',
  })
  assert.equal(res.ok, true)
  assert.equal(res.value, 'Blk 3 Sampaguita St., Unit 4B, Marikina City, Metro Manila, 1800')
})

test('buildOrderAddress omits an empty line 2 but requires the rest', () => {
  const res = buildOrderAddress({
    addressLine1: '1 Test Street',
    addressLine2: '',
    city: 'Quezon City',
    province: 'Metro Manila',
    postalCode: '1101',
  })
  assert.equal(res.value, '1 Test Street, Quezon City, Metro Manila, 1101')

  const noCity = buildOrderAddress({ addressLine1: '1 Test Street', city: '', province: 'Metro Manila', postalCode: '1101' })
  assert.equal(noCity.ok, false)
  assert.equal(noCity.error, MSG.cityRequired)

  const noLine = buildOrderAddress({ addressLine1: '', city: 'Manila', province: 'Metro Manila', postalCode: '1000' })
  assert.equal(noLine.ok, false)
  assert.equal(noLine.error, MSG.addressRequired)

  const noProv = buildOrderAddress({ addressLine1: '1 Test Street', city: 'Manila', province: '', postalCode: '1000' })
  assert.equal(noProv.error, MSG.provinceRequired)

  const noPostal = buildOrderAddress({ addressLine1: '1 Test Street', city: 'Manila', province: 'Metro Manila' })
  assert.equal(noPostal.error, MSG.postalRequired)
})

test('buildOrderAddress surfaces per-field format errors', () => {
  const junkLine = buildOrderAddress({ addressLine1: '123123123', city: 'Marikina', province: 'Metro Manila', postalCode: '1800' })
  assert.equal(junkLine.ok, false)
  assert.equal(junkLine.error, MSG.addressNoLetter)

  const junkLine2 = buildOrderAddress({ addressLine1: '1 Test Street', addressLine2: '123123123123', city: 'Marikina', province: 'Metro Manila', postalCode: '1800' })
  assert.equal(junkLine2.ok, false)
  assert.equal(junkLine2.error, MSG.addressNoLetter)

  const badPostal = buildOrderAddress({ addressLine1: '1 Test Street', city: 'Marikina', province: 'Metro Manila', postalCode: '12' })
  assert.equal(badPostal.error, MSG.postalInvalid)
})
