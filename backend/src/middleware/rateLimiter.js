import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

// behind the cloudflared tunnel every request arrives from 127.0.0.1 (vite
// proxy), which would put all visitors in one rate-limit bucket. With
// TRUST_PROXY enabled we key on Cloudflare's client IP instead; the header
// is only trusted when explicitly opted in, so direct access can't spoof it.
function clientKey(req) {
  const cf = req.headers['cf-connecting-ip']
  if (process.env.TRUST_PROXY && typeof cf === 'string' && cf) {
    return ipKeyGenerator(cf)
  }
  return ipKeyGenerator(req.ip)
}

// 5 login attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 10 signups per hour per IP
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many signups. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 5 step-up (password re-verification) attempts per 15 minutes per IP
export const stepUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 20 order creations per hour per IP
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many orders. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 60 cart operations per minute per IP
export const cartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many cart requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 60 product fetches per minute per IP (public catalog: list + categories + brands per page)
export const productLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 60 analytics events per minute per IP (anonymous endpoint, keeps the events table clean)
export const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})
