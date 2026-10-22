// Minimal CSV writer for admin exports. Dependency-free and unit-tested:
// every cell is escaped so Excel/LibreOffice can round-trip commas, quotes
// and newlines inside fields (product descriptions and details JSON need it).

// RFC 4180-style escaping: wrap in quotes when the value contains a comma,
// quote, CR or LF; double any embedded quotes; null/undefined become empty.
export function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// headers: string[]; rows: array of arrays (already in header order).
// Always CRLF line endings for maximum spreadsheet compatibility.
export function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  return `${lines.join('\r\n')}\r\n`
}
