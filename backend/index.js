// loads the .env file so we can use environment variables like SUPABASE_URL, etc.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'

// two supabase clients for the backend:
// supabaseAuth - used ONLY for auth operations (signUp, signIn, getUser)
//   auth calls like signUp/signIn change the client's internal session state,
//   which would make subsequent database calls act as that user instead of service_role
// supabaseAdmin - used for ALL database operations (select, update, upsert)
//   this one never touches auth, so it always stays in service_role mode and bypasses RLS
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
const supabaseAdmin = createClient(
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
// so it's stored safely in the database - no one can read it without the key
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

// does the opposite of encryptText - takes the encrypted string from the database
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

// this runs before any protected route - it checks if the user sent a valid
// supabase access token, and if so, attaches their user id, email, and role to the request
// uses supabaseAuth for token verification, supabaseAdmin for the database lookup
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  req.userId = user.id
  req.userEmail = user.email

  // grab the user's role from the profiles table using the admin client
  // defaults to 'user' if the profile doesn't exist yet (fresh signup)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  req.userRole = profile?.role || 'user'

  next()
}

// slap this after authMiddleware on any route that only admins should access
// if the user's role isn't 'admin', they get a 403 forbidden
function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// sets up express with security headers (helmet), cors for local dev, and json parsing
const app = express()
app.use(helmet())
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
app.use(express.json())

// quick endpoint for the frontend to check the current user's role
// used by the route guards and navbar to decide what to show
app.get('/api/me/role', authMiddleware, (req, res) => {
  res.json({ role: req.userRole })
})

// placeholder for products - returns empty for now, will be replaced
// when we hook up the product menu from the database
app.get('/api/products', (_, res) => {
  res.json({ items: [], page: 1, pageSize: 20, total: 0 })
})

// placeholder for cart - returns empty for now
app.get('/api/cart', (_, res) => {
  res.json({ items: [], total: 0 })
})

// placeholder for creating orders - just returns a fake order id for now
app.post('/api/orders', (req, res) => {
  res.status(201).json({ id: 'placeholder-order-id', status: 'created' })
})

// rate limiter for login - 5 attempts per 15 minutes per IP
// after that you're locked out and have to wait, prevents brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// rate limiter for signup - 3 accounts per hour per IP
// stops people from spamming new accounts
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many signups. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// login goes through our backend now instead of directly to supabase
// this way the rate limiter actually kicks in
// uses supabaseAuth for the signIn call (don't touch supabaseAdmin's state)
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return res.status(401).json({ error: error.message })
    res.json({ session: data.session })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// signup also goes through the backend - rate-limited to prevent spam
// uses supabaseAuth for creating the user, supabaseAdmin for writing the profile
// this separation is critical: signUp taints the auth client's session,
// but supabaseAdmin stays in service_role mode so it can always write to profiles
app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    // step 1: create the user in supabase auth (uses the auth client)
    const { data, error: authError } = await supabaseAuth.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName?.trim() || '',
          last_name: lastName?.trim() || '',
        },
      },
    })
    if (authError) throw authError
    if (!data.session) {
      return res.status(400).json({ error: 'Signup failed, no session returned' })
    }

    // step 2: save the encrypted profile using the admin client (bypasses RLS)
    // the database trigger creates a bare row with just the id,
    // so we wait a moment then update it with the actual encrypted data
    const userId = data.user.id
    const userEmail = data.user.email

    await new Promise(r => setTimeout(r, 500))

    // try updating the trigger-created row first
    const { data: updated } = await supabaseAdmin
      .from('profiles')
      .update({
        email: encryptText(userEmail),
        first_name: encryptText(firstName?.trim()),
        last_name: encryptText(lastName?.trim()),
        role: 'user',
      })
      .eq('id', userId)
      .select()

    // if no row existed yet (trigger was slow), fall back to upsert
    if (!updated || updated.length === 0) {
      console.log('Profile update returned 0 rows, falling back to upsert')
      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email: encryptText(userEmail),
          first_name: encryptText(firstName?.trim()),
          last_name: encryptText(lastName?.trim()),
          role: 'user',
        }, { onConflict: 'id' })
      if (upsertError) console.error('Profile upsert failed:', upsertError.message)
    }

    res.status(201).json({ session: data.session })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: err.message || 'Server error' })
  }
})

// fetches the logged-in user's profile from the profiles table
// decrypts all the personal info before sending it back to the frontend
// if no profile exists yet, returns empty fields so the form still loads
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { data: u, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country, role')
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
      role: u.role,
    })
  } catch (err) {
    console.error('Profile GET error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// saves/updates the user's profile - encrypts all personal info before storing it
// uses upsert so it creates the row if it doesn't exist, or updates it if it does
// then fetches the updated row and sends it back decrypted
// note: role is NOT included in the update - users can't change their own role
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

    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
    if (upsertError) throw upsertError

    const { data: u, error: selectError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country, role')
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
      role: u.role,
    })
  } catch (err) {
    console.error('Profile PUT error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// example admin-only endpoint - you can add more admin routes using the same pattern:
// authMiddleware first (checks the token), then requireAdmin (checks the role)
app.get('/api/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { count: userCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    res.json({ totalUsers: userCount ?? 0 })
  } catch (err) {
    console.error('Admin stats error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// starts the server on port 3001 (or whatever PORT is set in .env)
const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))
