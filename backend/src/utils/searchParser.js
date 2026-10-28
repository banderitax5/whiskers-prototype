// Natural-language search: turns a shopper's sentence (for example "food for a
// kitten with a sensitive stomach") into structured criteria. The AI only
// TRANSLATES the sentence. It never picks products; the frontend runs the
// existing deterministic recommendEngine.js + filters on the criteria.
// Plain fetch to Groq's OpenAI-compatible endpoint, same style as groqDraft.js.
import logger from './logger.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 8000
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

// Whitelists. Anything the model returns outside these lists is dropped.
export const SPECIES = ['dog', 'cat', 'bird', 'fish']
export const LIFE_STAGES = ['puppy', 'kitten', 'juvenile', 'adult', 'senior']
export const CONDITIONS = [
  'diabetes', 'kidney', 'urinary', 'sensitive-stomach', 'weight-management',
  'dental', 'joint', 'heart', 'liver', 'allergy-prone', 'healthy',
]
export const ALLERGIES = ['chicken', 'beef', 'dairy', 'grain', 'fish', 'egg']
const MAX_QUERY_LENGTH = 200

export function isSearchParserConfigured() {
  return Boolean(process.env.GROQ_API_KEY)
}

export function buildSearchPrompt(query) {
  return [
    'You convert a pet shop search sentence into structured criteria for a product filter.',
    '',
    'Rules:',
    `- species: one of ${SPECIES.join(', ')}, or null if not stated or unclear.`,
    `- lifeStage: one of ${LIFE_STAGES.join(', ')}, or null if not stated.`,
    `- condition: one of ${CONDITIONS.join(', ')}, or null if not stated. Use "healthy" only if the shopper says the pet is healthy or wants general food.`,
    `- allergies: array using only ${ALLERGIES.join(', ')}, or an empty array.`,
    '- Do not invent facts. If unsure, use null or an empty array.',
    '- Do not recommend products. Only fill in the criteria.',
    '',
    'Reply with JSON only, in this exact shape:',
    '{"species": null, "lifeStage": null, "condition": null, "allergies": []}',
    '',
    'Shopper search:',
    query,
  ].join('\n')
}

// Parse and validate the model reply. Returns a clean criteria object, or null
// when nothing usable came back. Unknown values are dropped, never passed on.
export function parseSearchCriteria(text) {
  if (typeof text !== 'string') return null
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null

  const pick = (value, allowed) =>
    typeof value === 'string' && allowed.includes(value.toLowerCase()) ? value.toLowerCase() : null

  const criteria = {
    species: pick(parsed.species, SPECIES),
    lifeStage: pick(parsed.lifeStage, LIFE_STAGES),
    condition: pick(parsed.condition, CONDITIONS),
    allergies: Array.isArray(parsed.allergies)
      ? [...new Set(parsed.allergies.map((a) => pick(a, ALLERGIES)).filter(Boolean))]
      : [],
  }

  // nothing recognised at all -> treat as no result so the caller falls back
  if (!criteria.species && !criteria.lifeStage && !criteria.condition && criteria.allergies.length === 0) {
    return null
  }
  return criteria
}

export async function parseSearchQuery(query) {
  if (!isSearchParserConfigured()) return null
  const text = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY_LENGTH) : ''
  if (text.length < 3) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildSearchPrompt(text) }],
      }),
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Search parser request failed')
      return null
    }
    const body = await res.json()
    return parseSearchCriteria(body?.choices?.[0]?.message?.content)
  } catch (err) {
    logger.warn({ err: err?.message }, 'Search parser request error')
    return null
  } finally {
    clearTimeout(timer)
  }
}
