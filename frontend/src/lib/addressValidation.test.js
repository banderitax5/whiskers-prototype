import { describe, it, expect } from 'vitest'
import { phoneError, addressLineError, postalError, ADDRESS_MESSAGES } from './addressValidation.js'

describe('phoneError', () => {
  it('accepts PH mobile shapes', () => {
    expect(phoneError('09171234567')).toBe('')
    expect(phoneError('0917 123 4567')).toBe('')
    expect(phoneError('0917-123-4567')).toBe('')
    expect(phoneError('+639171234567')).toBe('')
    expect(phoneError('639171234567')).toBe('')
    expect(phoneError('9171234567')).toBe('')
  })

  it('rejects junk and landline shapes with the server-matching message', () => {
    expect(phoneError('12312312312')).toBe(ADDRESS_MESSAGES.phoneInvalid)
    expect(phoneError('0288888888')).toBe(ADDRESS_MESSAGES.phoneInvalid)
    expect(phoneError('12345')).toBe(ADDRESS_MESSAGES.phoneInvalid)
    expect(phoneError('091712345678')).toBe(ADDRESS_MESSAGES.phoneInvalid)
    expect(phoneError('abc')).toBe(ADDRESS_MESSAGES.phoneInvalid)
  })

  it('empty is required by default, allowed when optional', () => {
    expect(phoneError('')).toBe(ADDRESS_MESSAGES.phoneRequired)
    expect(phoneError('   ')).toBe(ADDRESS_MESSAGES.phoneRequired)
    expect(phoneError('', { required: false })).toBe('')
    expect(phoneError(undefined, { required: false })).toBe('')
  })
})

describe('addressLineError', () => {
  it('rejects pure-digit and too-short values', () => {
    expect(addressLineError('123123123')).toBe(ADDRESS_MESSAGES.addressNoLetter)
    expect(addressLineError('123456789012345')).toBe(ADDRESS_MESSAGES.addressNoLetter)
    expect(addressLineError('1234')).toBe(ADDRESS_MESSAGES.addressTooShort)
    expect(addressLineError(5)).toBe(ADDRESS_MESSAGES.addressTooShort)
  })

  it('accepts real-looking addresses, cleans whitespace/control chars', () => {
    expect(addressLineError('1 Test Street')).toBe('')
    expect(addressLineError('Blk 3 Sampaguita St.')).toBe('')
    expect(addressLineError('  Unit 4B, Rizal Ave.  ')).toBe('')
    expect(addressLineError('Line1\nLine2  St')).toBe('')
    expect(addressLineError('Purok 4, Sitio Riverside')).toBe('')
  })

  it('empty allowed when optional, required message when not', () => {
    expect(addressLineError('')).toBe('')
    expect(addressLineError(undefined)).toBe('')
    expect(addressLineError('   ', { required: true })).toBe(ADDRESS_MESSAGES.addressRequired)
    expect(addressLineError('', { required: true })).toBe(ADDRESS_MESSAGES.addressRequired)
  })
})

describe('postalError', () => {
  it('requires exactly 4 digits when present', () => {
    expect(postalError('1234')).toBe('')
    expect(postalError(' 1800 ')).toBe('')
    expect(postalError('123')).toBe(ADDRESS_MESSAGES.postalInvalid)
    expect(postalError('abcd')).toBe(ADDRESS_MESSAGES.postalInvalid)
    expect(postalError('12345')).toBe(ADDRESS_MESSAGES.postalInvalid)
  })

  it('empty allowed when optional, required message when not', () => {
    expect(postalError('')).toBe('')
    expect(postalError('', { required: true })).toBe(ADDRESS_MESSAGES.postalRequired)
  })
})
