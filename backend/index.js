// backend/index.js
import 'dotenv/config'

//dependencies
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

//mysql connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

//jwt sign and verify
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

//encryption for user PII
const ENCRYPTION_KEY_BASE64 = process.env.ENCRYPTION_KEY || '' //encryption key from environment variables

const ENCRYPTION_KEY = ENCRYPTION_KEY_BASE64
  ? Buffer.from(ENCRYPTION_KEY_BASE64, 'base64') 
  : null
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be a 32-byte base64 string (AES-256-GCM)')
}

//encryption prefix and lengths
const ENC_PREFIX = 'enc:'
const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 16

//encrypt text function
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

//decrypt text function
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

// authentication middleware to verify JWT and attach userId to req
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.userId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// express app
const app = express()
app.use(helmet())
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
app.use(express.json())

// basic scaffolding for products
app.get('/api/products', (_, res) => {
  res.json({ items: [], page: 1, pageSize: 20, total: 0 })
})

// cart endpoints
app.get('/api/cart', (_, res) => {
  res.json({ items: [], total: 0 })
})

// orders endpoints
app.post('/api/orders', (req, res) => {
  res.status(201).json({ id: 'placeholder-order-id', status: 'created' })
})

//profile endpoints requires auth for security
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country FROM users WHERE id = ?',
      [req.userId]
    )
    const u = rows[0]
    if (!u) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json({
      id: u.id,
      email: u.email,
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

// profile starting point, requires auth for security
app.put('/api/profile', authMiddleware, async (req, res) => {
  const { firstName, lastName, phone, addressLine1, addressLine2, city, province, postalCode, country } = req.body ?? {}
  const fn = typeof firstName === 'string' ? firstName.trim() : null
  const ln = typeof lastName === 'string' ? lastName.trim() : null
  try {
    await pool.query(
      `UPDATE users SET 
        first_name = COALESCE(?, first_name), 
        last_name = COALESCE(?, last_name), 
        phone = ?, 
        address_line1 = ?, 
        address_line2 = ?, 
        city = ?, 
        province = ?, 
        postal_code = ?, 
        country = ? 
      WHERE id = ?`,
      [
        fn ? encryptText(fn) : null,
        ln ? encryptText(ln) : null,
        encryptText(phone),
        encryptText(addressLine1),
        encryptText(addressLine2),
        encryptText(city),
        encryptText(province),
        encryptText(postalCode),
        encryptText(country),
        req.userId,
      ]
    )
    const [rows] = await pool.query(
      'SELECT id, email, first_name, last_name, phone, address_line1, address_line2, city, province, postal_code, country FROM users WHERE id = ?',
      [req.userId]
    )
    const u = rows[0]
    res.json({
      id: u.id,
      email: u.email,
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

// login – query user by email, verify password with bcrypt, return JWT
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = ?', //query user by email
      [email.trim().toLowerCase()]
    )
    const user = rows[0]
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const match = await bcrypt.compare(password, user.password_hash) //verify password with bcrypt
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET, 
      { expiresIn: '12h' }
    )
    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: decryptText(user.first_name),
        lastName: decryptText(user.last_name),
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// singup – hash password with bcrypt, insert user into DB
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {}
  if (!email || !password || !firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: 'Email, password, first name, and last name are required' })
  }
  const emailNorm = email.trim().toLowerCase()
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [emailNorm]) //checks if the email exists
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }
    const password_hash = await bcrypt.hash(password, 10)
    await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)',
      [
        emailNorm,
        password_hash,
        encryptText(firstName), //encrypt first name
        encryptText(lastName), //encrypt last name
      ]
    )
    const [rows] = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = ?',
      [emailNorm]
    )
    const user = rows[0]
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '12h' }
    )
    //return token and user data
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: decryptText(user.first_name),
        lastName: decryptText(user.last_name),
      },
    })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))

pool.getConnection()
  .then((conn) => {
    console.log('Database connected')
    conn.release()
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message)
  })