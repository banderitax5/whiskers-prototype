const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

export function captureUTM() {
  const params = new URLSearchParams(window.location.search)
  const utmData = {}

  for (const param of UTM_PARAMS) {
    const value = params.get(param)
    if (value) utmData[param] = value
  }

  if (Object.keys(utmData).length > 0) {
    utmData.captured_at = new Date().toISOString()
    utmData.landing_page = window.location.pathname
    sessionStorage.setItem('utm_data', JSON.stringify(utmData))
  }
}

export function getUTMData() {
  try {
    const raw = sessionStorage.getItem('utm_data')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getUTMParam(param) {
  const data = getUTMData()
  return data?.[param] || null
}
