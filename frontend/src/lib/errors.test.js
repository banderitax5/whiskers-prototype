import { describe, it, expect } from 'vitest'
import {
  NETWORK_MESSAGE,
  DEFAULT_MESSAGE,
  friendlyMessage,
  errorFromResponse,
  messageForStatus,
  isNetworkError,
} from './errors'

describe('errors', () => {
  it('keeps a clear server message as written', () => {
    expect(friendlyMessage(new Error('Only 3 left in stock.'))).toBe('Only 3 left in stock.')
  })

  it('replaces transport noise with a connection message', () => {
    expect(friendlyMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE)
    expect(friendlyMessage(new Error('Load failed'))).toBe(NETWORK_MESSAGE)
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('replaces a bare HTTP status with status copy', () => {
    const err = new Error('HTTP 500')
    err.status = 500
    expect(friendlyMessage(err)).toMatch(/went wrong on our side/i)

    const unauth = new Error('HTTP 401')
    unauth.status = 401
    expect(friendlyMessage(unauth)).toMatch(/session has expired/i)
  })

  it('replaces parser noise', () => {
    expect(friendlyMessage(new SyntaxError('Unexpected token < in JSON at position 0'))).toBe(DEFAULT_MESSAGE)
    expect(friendlyMessage(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(DEFAULT_MESSAGE)
  })

  it('falls back when there is no message at all', () => {
    expect(friendlyMessage(null, 'Custom fallback')).toBe('Custom fallback')
    expect(friendlyMessage(new Error(''), 'Custom fallback')).toBe('Custom fallback')
  })

  it('maps statuses to helpful copy and treats 5xx alike', () => {
    expect(messageForStatus(403)).toMatch(/permission/i)
    expect(messageForStatus(429)).toMatch(/wait a moment/i)
    expect(messageForStatus(599)).toMatch(/went wrong on our side/i)
    expect(messageForStatus(418, 'Fallback')).toBe('Fallback')
  })

  it('builds an error from a response, preferring the server text', () => {
    const res = { status: 400 }
    const err = errorFromResponse(res, { error: 'Enter a valid Philippine mobile number.', code: 'BAD_PHONE' })
    expect(err.message).toBe('Enter a valid Philippine mobile number.')
    expect(err.status).toBe(400)
    expect(err.code).toBe('BAD_PHONE')
  })

  it('builds a friendly error when the body is empty or technical', () => {
    const res = { status: 502 }
    expect(errorFromResponse(res, {}).message).toMatch(/not responding/i)
    expect(errorFromResponse({ status: 500 }, { error: 'HTTP 500' }).message).toMatch(/went wrong on our side/i)
  })
})
