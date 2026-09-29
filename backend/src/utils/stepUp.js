import crypto from 'crypto'

// Stateless step-up tokens: HMAC-SHA256 signed, short-lived, bound to a user id.
// A token proves the user re-entered their password recently; it is only ever
// accepted alongside a valid Supabase access token for the same user.

const DEFAULT_TTL_SECONDS = 300

export function getStepUpTtlSeconds() {
  const ttl = Number(process.env.STEP_UP_TTL_SECONDS)
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS
}

let cachedSecret = null

function getSecret() {
  if (cachedSecret) return cachedSecret
  if (process.env.STEP_UP_SECRET) {
    cachedSecret = crypto.createHash('sha256').update(process.env.STEP_UP_SECRET).digest()
    return cachedSecret
  }
  // fall back to deriving a dedicated key from the existing AES-256 key
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64')
  if (key.length !== 32) {
    throw new Error('STEP_UP_SECRET or a valid ENCRYPTION_KEY is required for step-up tokens')
  }
  cachedSecret = Buffer.from(
    crypto.hkdfSync('sha256', key, Buffer.from('whiskers'), Buffer.from('step-up-token'), 32)
  )
  return cachedSecret
}

function sign(body) {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
}

export function signStepUpToken(userId, ttlSeconds = getStepUpTtlSeconds()) {
  const payload = { sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyStepUpToken(token, userId) {
  if (typeof token !== 'string') return false
  const [body, sig] = token.split('.')
  if (!body || !sig) return false

  const expected = sign(body)
  const given = Buffer.from(sig, 'base64url')
  const expectedBuf = Buffer.from(expected, 'base64url')
  if (given.length !== expectedBuf.length || !crypto.timingSafeEqual(given, expectedBuf)) {
    return false
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return false
  }
  if (payload.sub !== userId) return false
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return false
  return true
}
