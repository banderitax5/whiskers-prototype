import rateLimit from 'express-rate-limit'

// 5 login attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 10 signups per hour per IP
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many signups. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 20 order creations per hour per IP
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many orders. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 60 cart operations per minute per IP
export const cartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many cart requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 30 product fetches per minute per IP (public endpoint, higher limit)
export const productLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})
