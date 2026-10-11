// Product information helpers for the detail page accordion and the admin form.
// Sections are stored as an ordered array of {label, content}; empty sections
// are never rendered, so products without info (accessories, etc.) show nothing.

// the five curated sections the admin form exposes today
export const SECTION_LABELS = [
  'Product Info',
  'Ingredients',
  'Feeding Guide',
  'Guaranteed Analysis',
  'Storage Condition',
]

// raw jsonb -> renderable sections (drops anything malformed or contentless)
export function parseDetails(raw) {
  if (!Array.isArray(raw)) return []
  const sections = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    const content = typeof row.content === 'string' ? row.content.trim() : ''
    if (label && content) sections.push({ label, content })
  }
  return sections
}

// stored array -> the admin form's {label: content} fields
export function detailsToFields(details) {
  const fields = Object.fromEntries(SECTION_LABELS.map((label) => [label, '']))
  for (const section of parseDetails(details)) {
    if (section.label in fields) fields[section.label] = section.content
  }
  return fields
}

// the admin form's {label: content} fields -> storable array (or null)
export function fieldsToDetails(fields) {
  const sections = []
  for (const label of SECTION_LABELS) {
    const content = typeof fields?.[label] === 'string' ? fields[label].trim() : ''
    if (content) sections.push({ label, content })
  }
  return sections.length ? sections : null
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
