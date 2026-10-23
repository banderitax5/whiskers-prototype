import { Router } from 'express'
import { encryptText, decryptText } from '../utils/encryption.js'
import { authMiddleware } from '../middleware/auth.js'
import { supabaseAdmin } from '../config/supabase.js'
import {
  normalizeMobilePhone,
  sanitizeAddressLine,
  sanitizePlaceName,
  sanitizePostalCode,
  stripControlChars,
} from '../utils/addressRules.js'
import logger from '../utils/logger.js'

const router = Router()

const PROFILE_COLUMNS = 'id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country, role'

// field length limits to prevent storage abuse (address/phone/postal have
// dedicated rules in utils/addressRules.js)
const LIMITS = {
  name: 100,
  city: 100,
  province: 100,
  country: 100,
}

// strips control characters, trims whitespace and caps length,
// returns null for empty strings
function sanitizeField(value, maxLen) {
  if (typeof value !== 'string') return null
  const trimmed = stripControlChars(value).replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

function formatProfile(u, mfaEnabled = false) {
  return {
    id: u.id,
    email: decryptText(u.email),
    firstName: decryptText(u.first_name),
    lastName: decryptText(u.last_name),
    phone: decryptText(u.phone),
    addressLine1: decryptText(u.address_line1),
    addressLine2: decryptText(u.address_line2),
    city: decryptText(u.city),
    province: decryptText(u.province),
    postalCode: decryptText(u.postal_code),
    country: decryptText(u.country),
    role: u.role,
    mfaEnabled: !!mfaEnabled,
  }
}

// GET /api/profile/public — safe subset for use by other components (no address/phone)
router.get('/public', authMiddleware, async (req, res) => {
  try {
    const { data: u, error } = await req.db
      .from('profiles')
      .select('id, first_name, last_name, role')
      .eq('id', req.userId)
      .single()

    if (error || !u) {
      return res.json({ id: req.userId, firstName: '', lastName: '', role: 'user' })
    }
    res.json({
      id: u.id,
      firstName: decryptText(u.first_name),
      lastName: decryptText(u.last_name),
      role: u.role,
    })
  } catch (err) {
    logger.error({ err }, 'Profile public GET error')
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/profile — full profile (used by the Profile edit page)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data: u, error } = await req.db
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', req.userId)
      .single()

    if (error || !u) {
      return res.json({
        id: req.userId,
        email: req.userEmail,
        firstName: '',
        lastName: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        province: '',
        postalCode: '',
        country: '',
        role: 'user',
        mfaEnabled: !!req.mfaEnabled,
      })
    }
    res.json(formatProfile(u, req.mfaEnabled))
  } catch (err) {
    logger.error({ err }, 'Profile GET error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/profile
router.put('/', authMiddleware, async (req, res) => {
  const { firstName, lastName, phone, addressLine1, addressLine2, city, province, postalCode, country } = req.body ?? {}
  try {
    // validate everything before the upsert so a 400 never leaves a
    // partially-written profile behind
    const phoneCheck = normalizeMobilePhone(phone)
    const line1 = sanitizeAddressLine(addressLine1)
    const line2 = sanitizeAddressLine(addressLine2)
    const cityV = sanitizePlaceName(city, LIMITS.city)
    const provV = sanitizePlaceName(province, LIMITS.province)
    const postalV = sanitizePostalCode(postalCode)
    const failed = [phoneCheck, line1, line2, cityV, provV, postalV].find((r) => !r.ok)
    if (failed) return res.status(400).json({ error: failed.error })

    const updates = {
      id: req.userId,
      email: encryptText(req.userEmail),
      phone: encryptText(phoneCheck.value),
      address_line1: encryptText(line1.value),
      address_line2: encryptText(line2.value),
      city: encryptText(cityV.value),
      province: encryptText(provV.value),
      postal_code: encryptText(postalV.value),
    }
    const fn = sanitizeField(firstName, LIMITS.name)
    const ln = sanitizeField(lastName, LIMITS.name)
    if (fn) updates.first_name = encryptText(fn)
    if (ln) updates.last_name = encryptText(ln)
    const co = sanitizeField(country, LIMITS.country)
    if (co) updates.country = encryptText(co)

    // service-role write: authenticated PostgREST writes are revoked by
    // migration 2026-10-20_revoke_client_table_writes.sql so the validated
    // API is the only way in
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
    if (upsertError) throw upsertError

    const { data: u, error: selectError } = await req.db
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', req.userId)
      .single()
    if (selectError) throw selectError

    res.json(formatProfile(u, req.mfaEnabled))
  } catch (err) {
    logger.error({ err }, 'Profile PUT error')
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
