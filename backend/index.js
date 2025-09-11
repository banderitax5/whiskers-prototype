// backend/index.js
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

const app = express()
app.use(helmet())
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
app.use(express.json())

app.get('/api/health', (_, res) => res.json({ ok: true }))

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

app.post('/api/auth/login', (req, res) => {
  res.status(200).json({ token: 'placeholder-token' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))