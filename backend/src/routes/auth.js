import { Router } from 'express'
import { supabaseAuth, supabaseAdmin } from '../config/supabase.js'
import { encryptText } from '../utils/encryption.js'
import { loginLimiter, signupLimiter, stepUpLimiter, clientIp } from '../middleware/rateLimiter.js'
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
      // with "Confirm email" enabled Supabase refuses the sign-in until the
      // link is clicked - say so instead of pretending the password is wrong
      if ((error.message || '').toLowerCase().includes('email not confirmed')) {
        return res.status(403).json({ error: 'Please confirm your email address before signing in.' })
      }
      return res.status(401).json({ error: 'Invalid email or password.' })
    }
    // audit trail: a staff/admin sign-in is a security event - record when
    // and where (IP + device). Customer logins stay out of the audit log.
    try {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle()
      const role = prof?.role
      if (role === 'admin' || role === 'staff') {
        await logAudit({
          adminEmail: email.trim(),
          action: 'sign_in',
          target: `user:${data.session.user.id}`,
          changes: {
            role,
            ip: clientIp(req),
            user_agent: (req.get('user-agent') || '').slice(0, 300) || null,
          },
        })
      }
    } catch (auditErr) {
      logger.error({ err: auditErr }, 'Sign-in audit failed')
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
      const msg = authError.message || ''
      logger.warn({ supabaseError: msg }, 'Supabase signup rejected')
      if (msg.includes('already registered')) {
        return res.status(409).json({ error: 'An account with this email already exists.' })
      }
      // Supabase's own weak-password message is a wall of character classes;
      // say the actual policy in plain words instead.
      if (authError.code === 'weak_password' || /password should contain|weak password/i.test(msg)) {
        return res.status(400).json({
          error: 'Password needs at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.',
        })
      }
      if (/known to be weak|easy to guess|pwned|data breach/i.test(msg)) {
        return res.status(400).json({
          error: 'That password has appeared in a known data breach. Please choose a different one.',
        })
      }
      if (/signups? not allowed|signups? (are )?disabled/i.test(msg)) {
        return res.status(403).json({ error: 'Sign-ups are currently closed.' })
      }
      if (/rate limit|too many requests/i.test(msg)) {
        return res.status(429).json({ error: 'Too many attempts. Please try again shortly.' })
      }
      return res.status(400).json({ error: 'Signup failed. Please try again.' })
    }
    if (!data.user) {
      return res.status(400).json({ error: 'Signup failed. Please try again.' })
    }

    const userId = data.user.id
    const userEmail = data.user.email

    // Two Supabase modes:
    //  - "Confirm email" off -> signUp returns a session, the shopper is in;
    //  - "Confirm email" on  -> signUp returns the user but NO session until
    //    the emailed link is clicked. That is success, not failure: ensure the
    //    profile exists and tell the client to show the "check your inbox" step.
    // Supabase answers a duplicate address with an obfuscated user whose
    // identities array is empty - never touch that person's profile.
    const needsConfirmation = !data.session
    const duplicateAddress = Array.isArray(data.user.identities) && data.user.identities.length === 0
    if (needsConfirmation && duplicateAddress) {
      return res.status(201).json({ requiresConfirmation: true, email: userEmail })
    }

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

    if (needsConfirmation) {
      return res.status(201).json({ requiresConfirmation: true, email: userEmail })
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