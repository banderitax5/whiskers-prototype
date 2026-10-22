import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { csvEscape, toCsv } from '../src/utils/csv.js'

describe('csvEscape', () => {
  it('passes plain values through unchanged', () => {
    assert.equal(csvEscape('Royal Canin'), 'Royal Canin')
    assert.equal(csvEscape(265), '265')
  })

  it('empties null and undefined', () => {
    assert.equal(csvEscape(null), '')
    assert.equal(csvEscape(undefined), '')
  })

  it('quotes commas, quotes and newlines; doubles embedded quotes', () => {
    assert.equal(csvEscape('a,b'), '"a,b"')
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""')
    assert.equal(csvEscape('line1\nline2'), '"line1\nline2"')
    assert.equal(csvEscape('line1\r\nline2'), '"line1\r\nline2"')
  })
})

describe('toCsv', () => {
  it('joins headers and rows with CRLF and escapes cells', () => {
    const out = toCsv(['name', 'note'], [['Dog, small', 'ok'], ['Cat', 'has "quote"']])
    assert.equal(out, 'name,note\r\n"Dog, small",ok\r\nCat,"has ""quote"""\r\n')
  })

  it('serializes null as empty and keeps zero/false as text', () => {
    const out = toCsv(['a', 'b', 'c'], [[null, 0, false]])
    assert.equal(out, 'a,b,c\r\n,0,false\r\n')
  })
})
