import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDevice } from '../src/utils/device.js'

test('classifyDevice separates phones/tablets from desktop browsers', () => {
  assert.equal(
    classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'),
    'mobile'
  )
  assert.equal(
    classifyDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'),
    'mobile'
  )
  assert.equal(
    classifyDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1'),
    'mobile'
  )
  assert.equal(
    classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'),
    'desktop'
  )
  assert.equal(
    classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'),
    'desktop'
  )
})

test('classifyDevice returns unknown when there is no user agent', () => {
  assert.equal(classifyDevice(''), 'unknown')
  assert.equal(classifyDevice(undefined), 'unknown')
})
