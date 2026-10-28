// Product information helpers for the detail page accordion and the admin form.
// Sections are stored as an ordered array of {label, content}; empty sections
// are never rendered, so products without info (accessories, etc.) show nothing.

// the five curated sections the admin form starts with (owners can add,
// rename and remove sections - the backend accepts any labels, up to 12)
export const SECTION_LABELS = [
  'Product Info',
  'Ingredients',
  'Feeding Guide',
  'Guaranteed Analysis',
  'Storage Condition',
]

export const MAX_SECTIONS = 12
export const MAX_LABEL_LENGTH = 80

// raw jsonb -> sections. Labelled sections are kept even when blank so the
// admin form shows them as entered; the product page hides blank ones with
// visibleInfoSections(). Rows with no label are malformed and dropped.
export function parseDetails(raw) {
  if (!Array.isArray(raw)) return []
  const sections = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    const content = typeof row.content === 'string' ? row.content.trim() : ''
    if (label) sections.push({ label, content })
  }
  return sections
}

// what the shopper sees: only sections that have content to show
export function visibleInfoSections(raw) {
  return parseDetails(raw).filter((s) => s.content)
}

// stored jsonb -> the admin form's editable section list. Products with no
// saved details start from the five curated labels as an empty scaffold.
export function sectionsForEdit(details) {
  const stored = parseDetails(details)
  return stored.length ? stored : SECTION_LABELS.map((label) => ({ label, content: '' }))
}

// Applies an AI draft to the form's current sections without losing any of them.
// Draft sections match existing ones by label (case-insensitive) and replace
// only that section's text. A section the draft leaves out keeps what the admin
// already wrote. Draft labels that match nothing are added at the end, within
// MAX_SECTIONS.
export function mergeDraftSections(current, draftSections) {
  const base = Array.isArray(current) ? current.map((s) => ({ ...s })) : []
  if (!Array.isArray(draftSections) || draftSections.length === 0) return base

  for (const draft of draftSections) {
    const label = String(draft?.label || '').trim()
    const content = String(draft?.content || '')
    if (!label || !content.trim()) continue
    const match = base.find((s) => String(s.label || '').trim().toLowerCase() === label.toLowerCase())
    if (match) {
      match.content = content
    } else if (base.length < MAX_SECTIONS) {
      base.push({ label, content })
    }
  }
  return base
}

// the admin form's section list -> storable array (or null). Labelled sections
// are kept even when blank, so the list reappears as entered; rows with no
// label are dropped. More than MAX_SECTIONS keeps the first 12 (the server
// enforces the same cap).
export function sectionsToDetails(sections) {
  if (!Array.isArray(sections)) return null
  const out = []
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const label = typeof section.label === 'string' ? section.label.trim() : ''
    const content = typeof section.content === 'string' ? section.content.trim() : ''
    if (label) out.push({ label, content })
    if (out.length >= MAX_SECTIONS) break
  }
  return out.length ? out : null
}

const BULLET_RE = /^\s*[-*•]\s+/

// "a | b | c" -> ["a", "b", "c"], ignoring the empty edge cells that come from
// a leading/trailing pipe
function splitRow(line) {
  const cells = line.split('|').map((cell) => cell.trim())
  if (cells[0] === '') cells.shift()
  if (cells.length && cells[cells.length - 1] === '') cells.pop()
  return cells
}

// A tiny, dependency-free formatter so section content can carry light
// structure without pulling in a markdown library:
//   - lines starting with "-", "*" or a bullet glyph  -> a bullet list
//   - two or more consecutive lines containing "|" -> a table (first row = header)
//   - everything else -> paragraphs (one block per run of lines)
// Blocks are separated by blank lines. Returns:
//   [{type:'paragraph', lines}, {type:'list', items}, {type:'table', header, rows}]
export function formatContent(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let para = []
  let list = []
  let table = []

  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'paragraph', lines: para }); para = [] }
  }
  const flushList = () => {
    if (list.length) { blocks.push({ type: 'list', items: list }); list = [] }
  }
  const flushTable = () => {
    if (!table.length) return
    // a lone pipe line reads better as prose than as a one-cell table
    if (table.length === 1) {
      blocks.push({ type: 'paragraph', lines: table })
    } else {
      const [header, ...rows] = table.map(splitRow)
      blocks.push({ type: 'table', header, rows })
    }
    table = []
  }
  const flushAll = () => { flushPara(); flushList(); flushTable() }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) { flushAll(); continue }

    if (BULLET_RE.test(line)) {
      flushPara(); flushTable()
      list.push(line.replace(BULLET_RE, '').trim())
      continue
    }
    if (line.includes('|')) {
      flushPara(); flushList()
      table.push(line)
      continue
    }
    flushList(); flushTable()
    para.push(line)
  }
  flushAll()

  return blocks
}
