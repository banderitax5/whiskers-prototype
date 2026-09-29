import { Router } from 'express'
import { supabaseAuth, supabaseAdmin } from '../config/supabase.js'
import { encryptText } from '../utils/encryption.js'
import { loginLimiter, signupLimiter, stepUpLimiter } from '../middleware/rateLimiter.js'
import { authMiddleware } from '../middleware/auth.js'
import { signStepUpToken, getStepUpTtlSeconds } from '../utils/stepUp.js'
import { logAudit } from './admin.js'
import logger from '../utils/logger.js'

const router = Router()

// letters (incl. accented/Latin-extended), spaces, hyphens, apostrophes
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ' -]+$/

function isValidName(value) {
  const name = (value || '').trim()
  return name.length >= 2 && name.length <= 50 && NAME_RE.test(name)
}

// login route with rate limiter to prevent spam
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {}
  // check if user actually sent something
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    // sending credentials to supabase auth
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }
    res.json({ session: data.session })
  } catch (err) {
    logger.error({ err }, 'Login error')
    res.status(500).json({ error: 'Server error' })
  }
})

// signup route for new users
router.post('/signup', signupLimiter, async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  // server-side checks so the API can't be bypassed by skipping the form
  if (!isValidName(firstName)) {
    return res.status(400).json({ error: 'Enter a valid first name (2-50 letters, spaces, hyphens or apostrophes).' })
  }
  if (!isValidName(lastName)) {
    return res.status(400).json({ error: 'Enter a valid last name (2-50 letters, spaces, hyphens or apostrophes).' })
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }
  try {
    // create the auth user first
    const { data, error: authError } = await supabaseAuth.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName?.trim() || '',
          last_name: lastName?.trim() || '',
        },
      },
    })
    if (authError) {
      // map known Supabase errors to safe messages, hide internals
      const msg = authError.message
      if (msg.includes('already registered')) {
        return res.status(409).json({ error: 'An account with this email already exists.' })
      }
      if (msg.includes('Password should')) {
        return res.status(400).json({ error: 'Password does not meet requirements.' })
      }
      return res.status(400).json({ error: 'Signup failed. Please try again.' })
    }
    if (!data.session || !data.user) {
      return res.status(400).json({ error: 'Signup failed. Please try again.' })
    }

    const userId = data.user.id
    const userEmail = data.user.email

    // wait for the db trigger to finish creating the profile row (retry up to 5 times)
    let profileRow = null
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
      const { data: row } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
      if (row) { profileRow = row; break }
    }

    // update the profile with encrypted info for security
    const profileData = {
      email: encryptText(userEmail),
      first_name: encryptText(firstName?.trim()),
      last_name: encryptText(lastName?.trim()),
      role: 'user',
    }

    if (profileRow) {
      const { data: updated } = await supabaseAdmin
        .from('profiles')
        .update(profileData)
        .eq('id', userId)
        .select()
      if (!updated || updated.length === 0) {
        logger.warn({ userId }, 'Profile update returned 0 rows')
      }
    } else {
      // trigger didn't create the row — upsert it directly
      logger.warn({ userId }, 'Profile row not found after retries, upserting')
      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({ id: userId, ...profileData }, { onConflict: 'id' })
      if (upsertError) logger.error({ err: upsertError }, 'Profile upsert failed')
    }

    res.status(201).json({ session: data.session })
  } catch (err) {
    logger.error({ err }, 'Signup error')
    res.status(500).json({ error: 'Server error' })
  }
})

// step-up verification: re-checks the password before sensitive admin actions
// and issues a short-lived token bound to this user
router.post('/step-up', authMiddleware, stepUpLimiter, async (req, res) => {
  const { password } = req.body ?? {}
  if (!password) {
    return res.status(400).json({ error: 'Password is required' })
  }
  try {
    const { error } = await supabaseAuth.auth.signInWithPassword({
      email: req.userEmail,
      password,
    })
    if (error) {
      logAudit({ adminEmail: req.userEmail, action: 'stepup_failed', target: `user:${req.userId}` })
      return res.status(401).json({ error: 'Incorrect password.' })
    }
    const ttl = getStepUpTtlSeconds()
    logAudit({ adminEmail: req.userEmail, action: 'stepup_verified', target: `user:${req.userId}` })
    res.json({ stepUpToken: signStepUpToken(req.userId, ttl), expiresAt: new Date(Date.now() + ttl * 1000).toISOString() })
  } catch (err) {
    logger.error({ err }, 'Step-up error')
    res.status(500).json({ error: 'Server error' })
  }
})

export default router