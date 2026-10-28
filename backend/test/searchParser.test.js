import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSearchCriteria, buildSearchPrompt } from '../src/utils/searchParser.js'

test('parseSearchCriteria keeps valid fields and normalises case', () => {
  const c = parseSearchCriteria('{"species":"Cat","lifeStage":"kitten","condition":"sensitive-stomach","allergies":["chicken"]}')
  assert.deepEqual(c, {
    species: 'cat',
    lifeStage: 'kitten',
    condition: 'sensitive-stomach',
    allergies: ['chicken'],
  })
})

test('parseSearchCriteria drops values outside the whitelist', () => {
  const c = parseSearchCriteria('{"species":"dragon","lifeStage":"kitten","condition":null,"allergies":["gold"]}')
  assert.deepEqual(c, { species: null, lifeStage: 'kitten', condition: null, allergies: [] })
})

test('parseSearchCriteria returns null when nothing usable is recognised', () => {
  assert.equal(parseSearchCriteria('{"species":null,"lifeStage":null,"condition":null,"allergies":[]}'), null)
  assert.equal(parseSearchCriteria('not json at all'), null)
  assert.equal(parseSearchCriteria(undefined), null)
})

test('parseSearchCriteria recovers JSON wrapped in extra text', () => {
  const c = parseSearchCriteria('Here you go: {"species":"dog","lifeStage":null,"condition":null,"allergies":[]} thanks')
  assert.equal(c.species, 'dog')
})

test('buildSearchPrompt tells the model to translate only, never pick products', () => {
  assert.match(buildSearchPrompt('food for a kitten'), /Do not recommend products/)
})
