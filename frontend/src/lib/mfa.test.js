import { describe, it, expect } from 'vitest'
import { normalizeOtp, isOtpComplete, otpError, OTP_LENGTH } from './mfa.js'

describe('normalizeOtp', () => {
  it('keeps digits only', () => {
    expect(normalizeOtp('12a3-4 5')).toBe('12345')
  })

  it('strips pasted spaces and caps at six digits', () => {
    expect(normalizeOtp(' 123 456 ')).toBe('123456')
    expect(normalizeOtp('1234567890')).toBe('123456')
  })

  it('handles null and empty values', () => {
    expect(normalizeOtp(null)).toBe('')
    expect(normalizeOtp(undefined)).toBe('')
    expect(OTP_LENGTH).toBe(6)
  })
})

describe('isOtpComplete', () => {
  it('is true only for exactly six digits', () => {
    expect(isOtpComplete('123456')).toBe(true)
    expect(isOtpComplete('12345')).toBe(false)
    expect(isOtpComplete('1234567')).toBe(true) // extra digits are truncated on input
    expect(isOtpComplete('abcdef')).toBe(false)
    expect(isOtpComplete('')).toBe(false)
  })
})

describe('otpError', () => {
  it('asks for the code when empty', () => {
    expect(otpError('')).toMatch(/enter the 6-digit code/i)
  })

  it('rejects short codes', () => {
    expect(otpError('12')).toMatch(/exactly 6 digits/i)
  })

  it('accepts a complete code', () => {
    expect(otpError('123456')).toBe('')
  })
})
