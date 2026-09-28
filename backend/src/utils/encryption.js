import crypto from 'crypto'

const ENCRYPTION_KEY_BASE64 = process.env.ENCRYPTION_KEY || ''
const ENCRYPTION_KEY = ENCRYPTION_KEY_BASE64
  ? Buffer.from(ENCRYPTION_KEY_BASE64, 'base64')
  : null

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be a 32-byte base64 string (AES-256-GCM)')
}

const ENC_PREFIX = 'enc:'
const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 16

export function encryptText(value) {
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

export function decryptText(value) {
  if (value == null) return ''
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) {
    return value
  }
  try {
    const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    const iv = raw.subarray(0, GCM_IV_LENGTH)
    const tag = raw.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH)
    const ciphertext = raw.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH)
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
  } catch {
    // row encrypted under an older key or corrupted — return empty instead of
    // taking down the whole endpoint (and log nothing: values are PII)
    return ''
  }
}
