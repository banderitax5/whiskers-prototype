// Binary device classification for the dashboard's phone-vs-desktop chart.
// Tablets are grouped with phones so the chart has a clear two-way split.
// Kept dependency-free so it can be unit-tested without Express.
export function classifyDevice(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return 'unknown'
  if (/(ipad|tablet|playbook|silk|kindle)/.test(ua)) return 'mobile'
  if (/(mobi|android|iphone|ipod|windows phone|blackberry|opera mini|iemobile)/.test(ua)) {
    return 'mobile'
  }
  return 'desktop'
}
