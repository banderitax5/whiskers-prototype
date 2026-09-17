import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import logger from './src/utils/logger.js'

// Eagerly validate encryption key on startup
import './src/utils/encryption.js'
import { authMiddleware } from './src/middleware/auth.js'
import authRoutes from './src/routes/auth.js'
import profileRoutes from './src/routes/profile.js'
import cartRoutes from './src/routes/cart.js'
import productsRoutes from './src/routes/products.js'
import ordersRoutes from './src/routes/orders.js'
import adminRoutes from './src/routes/admin.js'
import eventsRoutes from './src/routes/events.js'

const app = express()
app.disable('x-powered-by')
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'sameorigin' },
}))
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
app.use('/api/events', eventsRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

const PORT = process.env.PORT || 4141
const server = app.listen(PORT, () => logger.info({ port: PORT }, 'API running'))

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully...')
  server.close(() => {
    logger.info('Server closed.')
    process.exit(0)
  })
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.')
    process.exit(1)
  }, 10_000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
