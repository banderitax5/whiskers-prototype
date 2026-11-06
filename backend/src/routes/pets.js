import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { petLimiter } from '../middleware/rateLimiter.js'
import { isUuid } from '../utils/uuid.js'
import { isSchemaPendingError, isStalePetsAllergyError } from '../utils/pgErrors.js'
import { MIGRATION_REQUIRED, INVALID_ID } from '../utils/messages.js'
import {
  MAX_PETS,
  MSG,
  normalizePetProfile,
  petRowToClient,
} from '../utils/petProfile.js'
import logger from '../utils/logger.js'

const router = Router()

// every pets route belongs to one signed-in account
router.use(authMiddleware, petLimiter)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Columns the client receives. pet_id is renamed to id by petRowToClient so the
// existing React context keeps working unchanged.
const PET_COLUMNS =
  'pet_id, name, species, life_stage, stage_source, birth_date, weight_kg, neutered, health_condition, allergies, activity, environment, breed_size, created_at, updated_at'

function sendSchemaPending(res) {
  return res.status(503).json({ error: MIGRATION_REQUIRED, code: 'MIGRATION_REQUIRED' })
}

// The live table can still carry an older allergy list (a check constraint is
// not changed by re-running "create table if not exists"). That is the same
// kind of problem as a missing column - fixed by a migration, not by the owner
// editing their pet - so it answers 503 with the same setup wording.
function isSchemaProblem(err) {
  return isSchemaPendingError(err) || isStalePetsAllergyError(err)
}

// a pet id from the client is only accepted in UUID shape; anything else is a
// 404 without touching the database
function petIdParam(req) {
  const id = String(req.params.petId || '').trim()
  return UUID_RE.test(id) ? id : null
}

// GET /api/pets - the signed-in account's pets, oldest first
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const { data, error } = await req.db
      .from('pets')
      .select(PET_COLUMNS)
      .order('created_at', { ascending: true })

    if (error) {
      if (isSchemaPendingError(error)) return sendSchemaPending(res)
      throw error
    }
    res.json({ items: (data || []).map((row) => petRowToClient(row)) })
  } catch (err) {
    logger.error({ err: err.message }, 'Pets fetch failed')
    res.status(500).json({ error: 'Could not load your pets. Please try again.' })
  }
})

// POST /api/pets - create one profile
router.post('/', async (req, res) => {
  const profile = normalizePetProfile(req.body)
  if (!profile.ok) return res.status(400).json({ error: profile.error })

  try {
    // Counting through the service role keeps the limit honest even when the
    // read policy is missing; this is the same client the inserts use.
    const { count, error: countError } = await supabaseAdmin
      .from('pets')
      .select('pet_id', { count: 'exact', head: true })
      .eq('user_id', req.userId)
    if (countError) {
      if (isSchemaPendingError(countError)) return sendSchemaPending(res)
      throw countError
    }
    if ((count || 0) >= MAX_PETS) {
      return res.status(400).json({ error: MSG.tooManyPets })
    }

    const { data, error } = await supabaseAdmin
      .from('pets')
      .insert({ user_id: req.userId, ...profile.value })
      .select(PET_COLUMNS)
      .single()

    if (error) {
      if (isSchemaProblem(error)) return sendSchemaPending(res)
      throw error
    }
    res.status(201).json({ pet: petRowToClient(data) })
  } catch (err) {
    logger.error({ err: err.message }, 'Pet create failed')
    res.status(500).json({ error: 'Could not save this pet. Please try again.' })
  }
})

// PUT /api/pets/:petId - replace one profile
router.put('/:petId', async (req, res) => {
  const petId = petIdParam(req)
  if (!petId) return res.status(404).json({ error: INVALID_ID })

  const profile = normalizePetProfile(req.body)
  if (!profile.ok) return res.status(400).json({ error: profile.error })

  try {
    // the where-clause carries the owner id, so a guessed id cannot touch
    // somebody else's pet even before RLS is considered
    const { data, error } = await supabaseAdmin
      .from('pets')
      .update({ ...profile.value, updated_at: new Date().toISOString() })
      .eq('pet_id', petId)
      .eq('user_id', req.userId)
      .select(PET_COLUMNS)
      .maybeSingle()

    if (error) {
      if (isSchemaProblem(error)) return sendSchemaPending(res)
      throw error
    }
    if (!data) return res.status(404).json({ error: MSG.notFound })
    res.json({ pet: petRowToClient(data) })
  } catch (err) {
    logger.error({ err: err.message }, 'Pet update failed')
    res.status(500).json({ error: 'Could not update this pet. Please try again.' })
  }
})

// DELETE /api/pets/:petId
router.delete('/:petId', async (req, res) => {
  const petId = petIdParam(req)
  if (!petId) return res.status(404).json({ error: INVALID_ID })

  try {
    const { data, error } = await supabaseAdmin
      .from('pets')
      .delete()
      .eq('pet_id', petId)
      .eq('user_id', req.userId)
      .select('pet_id')

    if (error) {
      if (isSchemaPendingError(error)) return sendSchemaPending(res)
      throw error
    }
    if (!data || data.length === 0) return res.status(404).json({ error: MSG.notFound })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: err.message }, 'Pet delete failed')
    res.status(500).json({ error: 'Could not remove this pet. Please try again.' })
  }
})

export default router
