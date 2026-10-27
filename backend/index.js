import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import logger from './src/utils/logger.js'

// Eagerly validate encryption key on startup
import './src/utils/encryption.js'
import { authAllowAal1 } from './src/middleware/auth.js'
import { aalFromToken } from './src/utils/mfa.js'
import authRoutes from './src/routes/auth.js'
import profileRoutes from './src/routes/profile.js'
import cartRoutes from './src/routes/cart.js'
import productsRoutes from './src/routes/products.js'
import ordersRoutes from './src/routes/orders.js'
import adminRoutes from './src/routes/admin.js'
import eventsRoutes from './src/routes/events.js'
import feedbackRoutes from './src/routes/feedback.js'
import supportRoutes from './src/routes/support.js'
import siteContentRoutes from './src/routes/siteContent.js'
import paymentsRoutes from './src/routes/payments.js'

const app = express()
app.disable('x-powered-by')

// set TRUST_PROXY=1 when running behind cloudflared / a reverse proxy so
// rate limits and logs key on the real client IP instead of the proxy's
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1)
}

// API responses are JSON, never framed. Keep the framing policy identical to
// the static site (deploy/Caddyfile, frontend/nginx.conf) so the same origin
// does not advertise two different answers to "may I embed this?".
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'deny' },
}))
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))

// Payment webhooks verify a signature over the RAW body, so they must be
// mounted before the JSON parser (which would consume/reshape the stream).
app.use('/api/payments', paymentsRoutes)

app.use(express.json({ limit: '100kb' }))

// Identity + MFA state. Deliberately reachable with an aal1 session so the
// admin gate can tell "needs to set up 2FA" apart from "not allowed at all";
// every actual admin endpoint still rejects aal1 sessions.
app.get('/api/me/role', authAllowAal1, (req, res) => {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  res.json({
    role: req.userRole,
    mfaEnabled: !!req.mfaEnabled,
    mfaVerified: !req.mfaEnabled || aalFromToken(token) === 'aal2',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/site-content', siteContentRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// JSON body that fails to parse arrives here with err.type = 'entity.parse.failed'
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' })
  }
  next(err)
})

// anything unmatched is a JSON 404, not Express's HTML page
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// final handler: log once, respond with a generic message — never a stack trace
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error')
  res.status(err.status || 500).json({ error: 'Internal server error' })
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
