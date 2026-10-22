import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

// Rate-limit keys are per actor: the authenticated user when authMiddleware
// has already run, otherwise the client IP. Keying signed-in traffic by user
// prevents one school/office/mobile-carrier NAT from sharing a single bucket
// (dozens of shoppers behind one IP would 429 each other). Auth routes
// (login/signup) have no user yet, so they stay IP-keyed.
//
// Behind the cloudflared tunnel every request arrives from 127.0.0.1 (vite
// proxy), which would put all visitors in one bucket. With TRUST_PROXY
// enabled we key on Cloudflare's client IP instead; the header is only
// trusted when explicitly opted in, so direct access can't spoof it.
//
// req.ip alone is the nearest proxy hop (the Docker bridge / Caddy), never
// the visitor - so anything that records "where from" (the sign-in audit
// row) must go through this helper too.
export function clientIp(req) {
  const cf = req.headers['cf-connecting-ip']
  if (process.env.TRUST_PROXY && typeof cf === 'string' && cf) return cf
  return req.ip || null
}

function ipKey(req) {
  return ipKeyGenerator(clientIp(req))
}

export function clientKey(req) {
  if (req.userId) return `user:${req.userId}`
  return ipKey(req)
}

// 20 login attempts per 15 minutes per IP. Kept IP-keyed (no user yet) but
// raised from 5: a single campus/mall Wi-Fi would lock out real customers
// after five tries.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 30 signups per hour per IP (a shared campus/office IP can host a class)
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many signups. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 15 step-up (password re-verification) attempts per 15 minutes per account
// (IP before sign-in). Owner-approved (2026-10-14): was 5, which locked
// admins out mid-session. Still abuse-resistant (password required per token)
// but generous enough for an editing session; the token itself lives 5 min.
export const stepUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many verification attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 100 order creations / promo validations per hour per account (IP when
// unauthenticated; orders require auth, so this is effectively per user).
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Too many orders. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 100 payment confirmations per hour per account (simulated gateway: pay /
// fail / retry clicks). Separate from orderLimiter so a walkthrough never
// spends the order-creation quota on confirmations.
export const payLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Too many payment attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 180 cart operations per minute per account (rapid quantity edits stay well
// under this; the limit exists to stop scripted abuse, not shoppers).
export const cartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  message: { error: 'Too many cart requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 600 catalog fetches per minute per IP (public: list + categories + brands).
// Anonymous traffic can only be keyed by IP; 60/min throttled a normal NAT
// once ~10 shoppers browsed at the same time.
export const productLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 300 storefront content reads per minute per IP (banners, home sections,
// nav). NavLinks force-refreshes on mount, so a shared IP reaches 60 fast.
export const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 300 analytics events per minute per IP (anonymous endpoint; keeps the
// events table clean without dropping impressions for shared-IP visitors)
export const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 60 review submissions per hour per account (batch save per order, upserts
// allowed). The POST route intentionally applies this once via router.use.
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: { error: 'Too many reviews. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// 60 support messages per hour per account (each account holds one thread)
export const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: { error: 'Too many messages. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})
