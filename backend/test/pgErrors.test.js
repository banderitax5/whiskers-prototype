import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSchemaPendingError, isStalePetsAllergyError, missingColumnOf } from '../src/utils/pgErrors.js'

test('a missing table or column still counts as a pending migration', () => {
  assert.equal(isSchemaPendingError({ code: '42P01' }), true)
  assert.equal(isSchemaPendingError({ code: 'PGRST205' }), true)
  assert.equal(isSchemaPendingError({ message: 'column pets.activity does not exist' }), true)
  assert.equal(isSchemaPendingError({ code: '23505', message: 'duplicate key' }), false)
})

test('a check constraint on allergies counts as a stale allergy list', () => {
  assert.equal(
    isStalePetsAllergyError({
      code: '23514',
      message: 'new row for relation "pets" violates check constraint "pets_allergies_check"',
    }),
    true
  )
  // the details field is where PostgREST sometimes puts the constraint text
  assert.equal(
    isStalePetsAllergyError({ code: '23514', details: 'allergies <@ ARRAY[...] is not true' }),
    true
  )
})

test('other constraint failures are not blamed on the allergy list', () => {
  assert.equal(
    isStalePetsAllergyError({
      code: '23514',
      message: 'new row for relation "pets" violates check constraint "pets_weight_kg_check"',
    }),
    false
  )
  assert.equal(isStalePetsAllergyError({ code: 'PGRST204' }), false)
  assert.equal(isStalePetsAllergyError(null), false)
})

test('missingColumnOf still finds the column it is given', () => {
  assert.equal(
    missingColumnOf({ message: "column pets.activity does not exist" }, ['activity']),
    'activity'
  )
})
