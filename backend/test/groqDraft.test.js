import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDraft, buildPrompt, isDraftConfigured, draftProductCopy } from '../src/utils/groqDraft.js'

test('parseDraft accepts a clean JSON reply', () => {
  const out = parseDraft('{"description":"Good food.","details":[{"label":"Ingredients","content":"- Chicken"}]}')
  assert.equal(out.description, 'Good food.')
  assert.deepEqual(out.details, [{ label: 'Ingredients', content: '- Chicken' }])
})

test('parseDraft tolerates prose around the JSON', () => {
  const out = parseDraft('Sure! {"description":"Tasty."} Hope it helps.')
  assert.equal(out.description, 'Tasty.')
})

test('parseDraft rejects garbage and empty replies', () => {
  assert.equal(parseDraft('no json here'), null)
  assert.equal(parseDraft('{broken'), null)
  assert.equal(parseDraft('{"description":"","details":[]}'), null)
  assert.equal(parseDraft(null), null)
})

test('parseDraft drops rows with empty label or content', () => {
  const out = parseDraft('{"description":"x","details":[{"label":"","content":"a"},{"label":"B","content":""}]}')
  assert.deepEqual(out.details, [])
})

test('buildPrompt sends only product facts, not customer data', () => {
  const prompt = buildPrompt({ prod_name: 'Dog Chow', brand: 'Purina', category: 'Dogs', price: 265 })
  assert.match(prompt, /Name: Dog Chow/)
  assert.doesNotMatch(prompt, /265/)
  assert.match(prompt, /Never mention the price/)
})

test('buildPrompt includes admin label facts and the originality rules', () => {
  const prompt = buildPrompt(
    { prod_name: 'Dog Chow', brand: 'Purina', category: 'Dogs' },
    'Ingredients: chicken, rice\nCrude protein 25% min'
  )
  assert.match(prompt, /Crude protein 25% min/)
  assert.match(prompt, /Do not copy label wording/)
  assert.match(prompt, /synonym/)
})

test('buildPrompt says so when no label facts were entered', () => {
  const prompt = buildPrompt({ prod_name: 'Dog Chow' }, '   ')
  assert.match(prompt, /none entered/)
})

test('isDraftConfigured depends only on the key, not the mail flag', () => {
  const oldKey = process.env.GROQ_API_KEY
  const oldMail = process.env.MAIL_DISABLED
  try {
    process.env.MAIL_DISABLED = '1'
    process.env.GROQ_API_KEY = 'x'
    assert.equal(isDraftConfigured(), true)
    delete process.env.GROQ_API_KEY
    assert.equal(isDraftConfigured(), false)
  } finally {
    if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey
    if (oldMail === undefined) delete process.env.MAIL_DISABLED; else process.env.MAIL_DISABLED = oldMail
  }
})

test('draftProductCopy returns null without a key and makes no network call', async () => {
  const oldKey = process.env.GROQ_API_KEY
  const realFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; throw new Error('should not fetch') }
  try {
    delete process.env.GROQ_API_KEY
    const out = await draftProductCopy({ prod_id: 'p1', prod_name: 'Test' })
    assert.equal(out, null)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = realFetch
    if (oldKey !== undefined) process.env.GROQ_API_KEY = oldKey
  }
})
