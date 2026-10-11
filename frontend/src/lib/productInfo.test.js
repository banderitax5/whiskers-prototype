import { describe, it, expect } from 'vitest'
import { parseDetails, detailsToFields, fieldsToDetails, formatContent, SECTION_LABELS } from './productInfo.js'

describe('parseDetails', () => {
  it('returns [] for anything that is not an array', () => {
    expect(parseDetails(null)).toEqual([])
    expect(parseDetails(undefined)).toEqual([])
    expect(parseDetails('nope')).toEqual([])
    expect(parseDetails({ label: 'x', content: 'y' })).toEqual([])
  })

  it('keeps only rows with a non-empty label and content', () => {
    expect(parseDetails([
      { label: ' Ingredients ', content: '  Wheat.  ' },
      { label: 'Empty', content: '' },
      { label: '   ', content: 'no label' },
      { label: 'NoContent', content: '   ' },
      'garbage',
      null,
    ])).toEqual([{ label: 'Ingredients', content: 'Wheat.' }])
  })
})

describe('detailsToFields / fieldsToDetails', () => {
  it('round-trips the curated sections', () => {
    const details = [
      { label: 'Feeding Guide', content: '2 meals a day' },
      { label: 'Ingredients', content: 'Chicken' },
    ]
    const fields = detailsToFields(details)
    expect(fields['Feeding Guide']).toBe('2 meals a day')
    expect(fields['Ingredients']).toBe('Chicken')
    // sections the product does not use are empty strings, not undefined
    expect(fields['Product Info']).toBe('')
    expect(fieldsToDetails(fields)).toEqual([
      { label: 'Ingredients', content: 'Chicken' },
      { label: 'Feeding Guide', content: '2 meals a day' },
    ])
  })

  it('ignores labels outside the curated set', () => {
    const fields = detailsToFields([{ label: 'Size Chart', content: 'ignored' }])
    expect(fields).toEqual(Object.fromEntries(SECTION_LABELS.map((l) => [l, ''])))
  })

  it('returns null when every field is blank', () => {
    expect(fieldsToDetails(Object.fromEntries(SECTION_LABELS.map((l) => [l, '  '])))).toBeNull()
    expect(fieldsToDetails(undefined)).toBeNull()
  })
})

describe('formatContent', () => {
  it('returns no blocks for empty input', () => {
    expect(formatContent('')).toEqual([])
    expect(formatContent(null)).toEqual([])
    expect(formatContent('   \n  \n ')).toEqual([])
  })

  it('groups consecutive bullet lines into one list', () => {
    expect(formatContent('- Less stool odor\n- Better gut health\n* Omega-3 & 6')).toEqual([
      { type: 'list', items: ['Less stool odor', 'Better gut health', 'Omega-3 & 6'] },
    ])
  })

  it('builds a table from consecutive pipe rows, first row as header', () => {
    expect(formatContent('Body Weight | Amount\n2-5 | 50-95\n5-10 | 95-155')).toEqual([
      { type: 'table', header: ['Body Weight', 'Amount'], rows: [['2-5', '50-95'], ['5-10', '95-155']] },
    ])
  })

  it('trims the empty edge cells of a padded pipe row', () => {
    expect(formatContent('A | B\n| 1 | 2 |')).toEqual([
      { type: 'table', header: ['A', 'B'], rows: [['1', '2']] },
    ])
  })

  it('renders a single pipe row as prose, not a one-cell table', () => {
    expect(formatContent('only one | cell')).toEqual([
      { type: 'paragraph', lines: ['only one | cell'] },
    ])
  })

  it('keeps consecutive plain lines together as one paragraph block', () => {
    expect(formatContent('Store in a cool dry place.\nKeep sealed after opening.')).toEqual([
      { type: 'paragraph', lines: ['Store in a cool dry place.', 'Keep sealed after opening.'] },
    ])
  })

  it('splits blocks on blank lines and switches type cleanly', () => {
    expect(formatContent('Intro line.\n\n- a\n- b\n\nNutrient | Amount\nProtein | 18%')).toEqual([
      { type: 'paragraph', lines: ['Intro line.'] },
      { type: 'list', items: ['a', 'b'] },
      { type: 'table', header: ['Nutrient', 'Amount'], rows: [['Protein', '18%']] },
    ])
  })

  it('flushes the current block when the type changes without a blank line', () => {
    expect(formatContent('A sentence.\n- bullet')).toEqual([
      { type: 'paragraph', lines: ['A sentence.'] },
      { type: 'list', items: ['bullet'] },
    ])
    expect(formatContent('- bullet\nA sentence.')).toEqual([
      { type: 'list', items: ['bullet'] },
      { type: 'paragraph', lines: ['A sentence.'] },
    ])
  })

  it('normalizes Windows line endings', () => {
    expect(formatContent('- a\r\n- b')).toEqual([{ type: 'list', items: ['a', 'b'] }])
  })
})
