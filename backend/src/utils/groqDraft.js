// Admin "Write with AI": turns a product's facts into a draft description and
// detail sections. Plain fetch to Groq's OpenAI-compatible endpoint (no SDK,
// same style as the Brevo mailer). The draft is a suggestion only; nothing is
// saved until an admin reviews it and presses Save.
import { sanitizeDetails } from './productDetails.js'
import logger from './logger.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 20000
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export function isDraftConfigured() {
  return Boolean(process.env.GROQ_API_KEY)
}

// Only the facts we already store, plus the label facts the admin typed in, go
// into the prompt. No customer data, and no text fetched from other websites.
// labelFacts is free text the admin copied from the printed label or the
// supplier's sheet (ingredients, guaranteed analysis, feeding guide).
export function buildPrompt(product, labelFacts = '') {
  const facts = [
    `Name: ${product.prod_name || 'Unknown'}`,
    product.brand ? `Brand: ${product.brand}` : null,
    product.category ? `Category: ${product.category}` : null,
  ].filter(Boolean).join('\n')

  const label = String(labelFacts || '').trim()

  return [
    'You write product copy for a Philippine pet supply shop. The copy helps customers decide whether to buy.',
    '',
    'Facts rules:',
    '- Use only the facts given below. Do not invent ingredients, weights, sizes, certifications, or health claims.',
    '- If a fact is unknown, leave it out. Never guess to fill space.',
    '- You may describe what the product type is generally used for (for example, what a pellet food is for) as long as you do not claim specifics about this exact product.',
    '- The label facts are the only source for ingredients, analysis numbers and feeding amounts. If the label facts do not mention something, do not write it.',
    '',
    'Originality rules:',
    '- Write every sentence yourself, from the facts. Do not copy label wording, sentences, lists or table layouts word for word.',
    '- Do not swap single words for synonyms (for example "delicious" to "yummy"). Rephrase the meaning in new sentences with a new structure.',
    '- Explain what each fact means for the customer (for example, what a protein number means for a growing dog) instead of repeating the label.',
    '',
    'Style rules:',
    '- Detailed and helpful, friendly and plain. Not casual, not humorous, no hype words like "amazing" or "best".',
    '- Write in full sentences. Speak to the customer as "your pet" or "your fish".',
    '- Do not use markdown, emojis, or headings inside the text.',
    '- Never mention the price, peso amounts, "PHP", cost, or discounts. Price is shown separately on the page, so the copy must not repeat it.',
    '',
    'Description: 3-5 sentences in one paragraph. Say what the product is, who it is for, and why a customer would choose it.',
    '',
    'Detail sections: write each section as short plain sentences. For a list of features or points, put each point on its own line starting with "- " (a dash and a space). Use one section per label, and skip any section you have no facts for.',
    'Use labels only from: Product Info, Ingredients, Feeding Guide, Guaranteed Analysis, Storage Condition.',
    '',
    'Reply with JSON only, in this exact shape:',
    '{"description": "paragraph text", "details": [{"label": "Product Info", "content": "sentences and - bullet lines"}]}',
    '',
    'Product facts:',
    facts,
    '',
    'Label facts (from the printed label or supplier sheet, admin entered):',
    label || '(none entered. Write only the general description and skip the detail sections that need label facts.)',
  ].join('\n')
}

// Parse the model reply defensively. Returns { description, details } with the
// same limits the admin API enforces, so the form accepts what we return.
export function parseDraft(text) {
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

  const description = typeof parsed.description === 'string'
    ? parsed.description.trim().slice(0, 2000)
    : ''
  // sanitizeDetails returns { value } on success and { error } on rejection;
  // a failed check means we keep no sections rather than pass bad rows along.
  const detailsResult = sanitizeDetails(Array.isArray(parsed.details) ? parsed.details : [])
  const details = !detailsResult.error && Array.isArray(detailsResult.value) ? detailsResult.value : []

  if (!description && details.length === 0) return null
  return { description, details }
}

export async function draftProductCopy(product, labelFacts = '') {
  if (!isDraftConfigured()) return null
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
        temperature: 0.4,
        // longer copy needs room; without this the JSON can be cut off mid-section
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildPrompt(product, labelFacts) }],
      }),
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Groq draft request failed')
      return null
    }
    const body = await res.json()
    return parseDraft(body?.choices?.[0]?.message?.content)
  } catch (err) {
    logger.warn({ err: err?.message }, 'Groq draft request error')
    return null
  } finally {
    clearTimeout(timer)
  }
}
