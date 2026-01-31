// backend/index.js
import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

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

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

const app = express()
app.use(helmet())
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
app.use(express.json())

// Health check – uses pool to verify DB connection
app.get('/api/health', async (_, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, database: 'connected' })
  } catch (err) {
    res.status(500).json({ ok: false, database: 'disconnected', error: err.message })
  }
})

// Basic scaffolds
app.get('/api/products', (_, res) => {
  res.json({ items: [], page: 1, pageSize: 20, total: 0 })
})

app.get('/api/cart', (_, res) => {
  res.json({ items: [], total: 0 })
})

app.post('/api/orders', (req, res) => {
  res.status(201).json({ id: 'placeholder-order-id', status: 'created' })
})

// Login – query user by email, verify password with bcrypt, return JWT
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    )
    const user = rows[0]
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Signup – hash password with bcrypt, insert user into DB
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {}
  if (!email || !password || !firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: 'Email, password, first name, and last name are required' })
  }
  const emailNorm = email.trim().toLowerCase()
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [emailNorm])
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }
    const password_hash = await bcrypt.hash(password, 10)
    await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)',
      [emailNorm, password_hash, firstName.trim(), lastName.trim()]
    )
    const [rows] = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = ?',
      [emailNorm]
    )
    const user = rows[0]
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
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