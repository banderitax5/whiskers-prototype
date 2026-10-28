import { describe, it, expect } from 'vitest'
import { parseDetails, visibleInfoSections, sectionsForEdit, sectionsToDetails, formatContent, mergeDraftSections, SECTION_LABELS } from './productInfo.js'

describe('mergeDraftSections', () => {
  const current = SECTION_LABELS.map((label) => ({ label, content: label === 'Ingredients' ? 'Wheat, rice.' : '' }))

  it('keeps every section the draft does not cover, including ones the admin wrote', () => {
    const merged = mergeDraftSections(current, [{ label: 'Product Info', content: 'Brand: Amazon.' }])
    expect(merged.map((s) => s.label)).toEqual(SECTION_LABELS)
    expect(merged.find((s) => s.label === 'Ingredients').content).toBe('Wheat, rice.')
    expect(merged.find((s) => s.label === 'Product Info').content).toBe('Brand: Amazon.')
  })

  it('matches labels case-insensitively and does not duplicate them', () => {
    const merged = mergeDraftSections(current, [{ label: 'feeding guide', content: 'Twice daily.' }])
    expect(merged).toHaveLength(SECTION_LABELS.length)
    expect(merged.find((s) => s.label === 'Feeding Guide').content).toBe('Twice daily.')
  })

  it('ignores draft sections with empty content and adds new labels at the end', () => {
    const merged = mergeDraftSections(current, [
      { label: 'Storage Condition', content: '   ' },
      { label: 'Warnings', content: 'Keep dry.' },
    ])
    expect(merged.find((s) => s.label === 'Storage Condition').content).toBe('')
    expect(merged.at(-1)).toEqual({ label: 'Warnings', content: 'Keep dry.' })
  })

  it('respects the 12-section cap', () => {
    const full = Array.from({ length: 12 }, (_, i) => ({ label: `S${i}`, content: 'x' }))
    expect(mergeDraftSections(full, [{ label: 'Extra', content: 'y' }])).toHaveLength(12)
  })

  it('returns the current sections unchanged when the draft has none', () => {
    expect(mergeDraftSections(current, [])).toEqual(current)
    expect(mergeDraftSections(current, undefined)).toEqual(current)
  })
})

describe('parseDetails', () => {
  it('returns [] for anything that is not an array', () => {
    expect(parseDetails(null)).toEqual([])
    expect(parseDetails(undefined)).toEqual([])
    expect(parseDetails('nope')).toEqual([])
    expect(parseDetails({ label: 'x', content: 'y' })).toEqual([])
  })

  it('keeps labelled rows even when blank; drops rows with no label', () => {
    expect(parseDetails([
      { label: ' Ingredients ', content: '  Wheat.  ' },
      { label: 'Empty', content: '' },
      { label: '   ', content: 'no label' },
      { label: 'NoContent', content: '   ' },
      'garbage',
      null,
    ])).toEqual([
      { label: 'Ingredients', content: 'Wheat.' },
      { label: 'Empty', content: '' },
      { label: 'NoContent', content: '' },
    ])
  })
})

describe('visibleInfoSections', () => {
  it('hides blank sections from the product page', () => {
    expect(visibleInfoSections([
      { label: 'Product Info', content: 'Tuna.' },
      { label: 'Ingredients', content: '' },
    ])).toEqual([{ label: 'Product Info', content: 'Tuna.' }])
  })
})

describe('sectionsForEdit / sectionsToDetails', () => {
  it('loads stored sections as-is for editing (including labels outside the curated set)', () => {
    const details = [
      { label: 'Feeding Guide', content: '2 meals a day' },
      { label: 'Size Chart', content: 'S / M / L' },
    ]
    expect(sectionsForEdit(details)).toEqual([
      { label: 'Feeding Guide', content: '2 meals a day' },
      { label: 'Size Chart', content: 'S / M / L' },
    ])
  })

  it('falls back to the five curated labels when a product has no details', () => {
    expect(sectionsForEdit(null)).toEqual(SECTION_LABELS.map((label) => ({ label, content: '' })))
    expect(sectionsForEdit([])).toEqual(SECTION_LABELS.map((label) => ({ label, content: '' })))
  })

  it('round-trips through sectionsToDetails, keeping blank labelled sections', () => {
    const sections = [
      { label: ' Ingredients ', content: '  Chicken  ' },
      { label: 'Empty', content: '   ' },
      { label: '   ', content: 'no label' },
      { label: 'Size Chart', content: 'S / M / L' },
    ]
    expect(sectionsToDetails(sections)).toEqual([
      { label: 'Ingredients', content: 'Chicken' },
      { label: 'Empty', content: '' },
      { label: 'Size Chart', content: 'S / M / L' },
    ])
  })

  it('keeps the five default sections even when all are blank', () => {
    expect(sectionsToDetails(SECTION_LABELS.map((l) => ({ label: l, content: '  ' })))).toHaveLength(5)
    expect(sectionsToDetails(undefined)).toBeNull()
  })

  it('keeps at most 12 sections', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ label: `S${i}`, content: 'x' }))
    expect(sectionsToDetails(many)).toHaveLength(12)
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
