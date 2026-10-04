import { Router } from 'express'
import { encryptText, decryptText } from '../utils/encryption.js'
import { authMiddleware } from '../middleware/auth.js'
import logger from '../utils/logger.js'

const router = Router()

const PROFILE_COLUMNS = 'id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country, role'

// field length limits to prevent storage abuse
const LIMITS = {
  name: 100,
  phone: 20,
  address: 200,
  city: 100,
  province: 100,
  postalCode: 20,
  country: 100,
}

// trims whitespace and caps length, returns null for empty strings
function sanitizeField(value, maxLen) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

// strips everything except digits, +, -, (, ), and spaces
function sanitizePhone(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9+\-() ]/g, '').trim()
  if (!cleaned) return null
  return cleaned.slice(0, LIMITS.phone)
}

function formatProfile(u) {
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
      })
    }
    res.json(formatProfile(u))
  } catch (err) {
    logger.error({ err }, 'Profile GET error')
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/profile
router.put('/', authMiddleware, async (req, res) => {
  const { firstName, lastName, phone, addressLine1, addressLine2, city, province, postalCode, country } = req.body ?? {}
  try {
    const updates = {
      id: req.userId,
      email: encryptText(req.userEmail),
      phone: encryptText(sanitizePhone(phone)),
      address_line1: encryptField(addressLine1, LIMITS.address),
      address_line2: encryptField(addressLine2, LIMITS.address),
      city: encryptField(city, LIMITS.city),
      province: encryptField(province, LIMITS.province),
      postal_code: encryptField(postalCode, LIMITS.postalCode),
    }
    const fn = sanitizeField(firstName, LIMITS.name)
    const ln = sanitizeField(lastName, LIMITS.name)
    if (fn) updates.first_name = encryptText(fn)
    if (ln) updates.last_name = encryptText(ln)
    const co = sanitizeField(country, LIMITS.country)
    if (co) updates.country = encryptText(co)

    const { error: upsertError } = await req.db
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
    if (upsertError) throw upsertError

    const { data: u, error: selectError } = await req.db
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', req.userId)
      .single()
    if (selectError) throw selectError

    res.json(formatProfile(u))
  } catch (err) {
    logger.error({ err }, 'Profile PUT error')
    res.status(500).json({ error: 'Server error' })
  }
})

// helper that sanitizes then encrypts a field
function encryptField(value, maxLen) {
  const sanitized = sanitizeField(value, maxLen)
  return encryptText(sanitized)
}

export default router
