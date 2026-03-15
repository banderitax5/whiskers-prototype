// loads the .env file so we can use environment variables like SUPABASE_URL, etc.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// this is the supabase client for the backend — uses the service_role key
// so it can bypass row level security and do admin-level stuff
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// grabs the encryption key from .env and turns it into a 32-byte buffer
// this is needed for AES-256-GCM encryption of user personal info
const ENCRYPTION_KEY_BASE64 = process.env.ENCRYPTION_KEY || ''
const ENCRYPTION_KEY = ENCRYPTION_KEY_BASE64
  ? Buffer.from(ENCRYPTION_KEY_BASE64, 'base64')
  : null
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be a 32-byte base64 string (AES-256-GCM)')
}

const ENC_PREFIX = 'enc:'
const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 16

// takes plain text (like a name or phone number) and encrypts it
// so it's stored safely in the database — no one can read it without the key
function encryptText(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const iv = crypto.randomBytes(GCM_IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64')
  return `${ENC_PREFIX}${payload}`
}

// does the opposite of encryptText — takes the encrypted string from the database
// and turns it back into readable text so we can send it to the frontend
function decryptText(value) {
  if (value == null) return ''
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) {
    return value
  }
  const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
  const iv = raw.subarray(0, GCM_IV_LENGTH)
  const tag = raw.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH)
  const ciphertext = raw.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH)
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
}

// this runs before any protected route — it checks if the user sent a valid
// supabase access token, and if so, attaches their user id and email to the request
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  req.userId = user.id
  req.userEmail = user.email
  next()
}

// sets up express with security headers (helmet), cors for local dev, and json parsing
const app = express()
app.use(helmet())
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
app.use(express.json())

// placeholder for products — returns empty for now, will be replaced
// when we hook up the product menu from the database
app.get('/api/products', (_, res) => {
  res.json({ items: [], page: 1, pageSize: 20, total: 0 })
})

// placeholder for cart — returns empty for now
app.get('/api/cart', (_, res) => {
  res.json({ items: [], total: 0 })
})

// placeholder for creating orders — just returns a fake order id for now
app.post('/api/orders', (req, res) => {
  res.status(201).json({ id: 'placeholder-order-id', status: 'created' })
})

// called right after signup — saves the first name and last name (encrypted)
// into the profiles table so they show up when the user opens their profile
app.post('/api/profile/init', authMiddleware, async (req, res) => {
  const { firstName, lastName } = req.body ?? {}
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: req.userId,
        email: encryptText(req.userEmail),
        first_name: encryptText(firstName),
        last_name: encryptText(lastName),
      }, { onConflict: 'id' })
    if (error) throw error
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Profile init error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// fetches the logged-in user's profile from the profiles table
// decrypts all the personal info before sending it back to the frontend
// if no profile exists yet, returns empty fields so the form still loads
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { data: u, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country')
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
      })
    }
    res.json({
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
    })
  } catch (err) {
    console.error('Profile GET error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// saves/updates the user's profile — encrypts all personal info before storing it
// uses upsert so it creates the row if it doesn't exist, or updates it if it does
// then fetches the updated row and sends it back decrypted
app.put('/api/profile', authMiddleware, async (req, res) => {
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

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
    if (upsertError) throw upsertError

    const { data: u, error: selectError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country')
      .eq('id', req.userId)
      .single()
    if (selectError) throw selectError

    res.json({
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
    })
  } catch (err) {
    console.error('Profile PUT error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// starts the server on port 3001 (or whatever PORT is set in .env)
const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))
