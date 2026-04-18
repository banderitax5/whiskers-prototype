import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { encryptText, decryptText } from '../utils/encryption.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

const PROFILE_COLUMNS = 'id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country, role'

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

// GET /api/profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data: u, error } = await supabaseAdmin
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
    console.error('Profile GET error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/profile
router.put('/', authMiddleware, async (req, res) => {
  const { firstName, lastName, phone, addressLine1, addressLine2, city, province, postalCode, country } = req.body ?? {}
  const fn = typeof firstName === 'string' ? firstName.trim() : null
  const ln = typeof lastName === 'string' ? lastName.trim() : null
  try {
    const updates = {
      id: req.userId,
      email: encryptText(req.userEmail),
      phone: encryptText(phone),
      address_line1: encryptText(addressLine1),
      address_line2: encryptText(addressLine2),
      city: encryptText(city),
      province: encryptText(province),
      postal_code: encryptText(postalCode),
      country: encryptText(country),
    }
    if (fn) updates.first_name = encryptText(fn)
    if (ln) updates.last_name = encryptText(ln)

    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
    if (upsertError) throw upsertError

    const { data: u, error: selectError } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', req.userId)
      .single()
    if (selectError) throw selectError

    res.json(formatProfile(u))
  } catch (err) {
    console.error('Profile PUT error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
