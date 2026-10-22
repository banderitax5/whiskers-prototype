import { describe, it, expect } from 'vitest'
import { passwordProblems, passwordError } from './passwordRules.js'

const ids = (value) => passwordProblems(value).map((r) => r.id)

describe('passwordRules (mirrors the Supabase weak_password policy)', () => {
  it('accepts a password with all four character classes', () => {
    expect(ids('Whiskers1!')).toEqual([])
    expect(passwordError('Whiskers1!')).toBe('')
  })

  it('flags the keyboard-mash case from the bug report', () => {
    // "asdfasdf" is 8 chars but has no uppercase, digit or symbol
    expect(ids('asdfasdf')).toEqual(['upper', 'number', 'symbol'])
    expect(passwordError('asdfasdf')).toMatch(/uppercase/i)
  })

  it('flags missing length, digit and symbol individually', () => {
    expect(ids('Ab1!')).toContain('length')
    expect(ids('Abcdefgh')).toContain('number')
    expect(ids('Abcdefg1')).toContain('symbol')
  })

  it('treats a space as not a symbol', () => {
    expect(ids('Abcdefg1 ')).toContain('symbol')
  })

  it('accepts symbols from the Supabase set', () => {
    expect(ids('Abcdefg1@')).toEqual([])
    expect(ids('Abcdefg1#')).toEqual([])
    expect(ids('Abcdefg1?')).toEqual([])
  })
})
