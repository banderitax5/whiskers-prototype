import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

// Eagerly validate encryption key on startup
import './src/utils/encryption.js'

import { authMiddleware } from './src/middleware/auth.js'
import authRoutes from './src/routes/auth.js'
import profileRoutes from './src/routes/profile.js'
import cartRoutes from './src/routes/cart.js'
import productsRoutes from './src/routes/products.js'
import ordersRoutes from './src/routes/orders.js'
import adminRoutes from './src/routes/admin.js'

const app = express()
app.use(helmet())
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
app.use(express.json())

app.get('/api/me/role', authMiddleware, (req, res) => {
  res.json({ role: req.userRole })
})

app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/admin', adminRoutes)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))
