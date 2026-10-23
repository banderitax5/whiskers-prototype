import { Router } from 'express'
import { supabaseAuth, supabaseAdmin } from '../config/supabase.js'
import { encryptText } from '../utils/encryption.js'
import { loginLimiter, signupLimiter, stepUpLimiter, mfaLimiter, clientIp } from '../middleware/rateLimiter.js'
import { authMiddleware, authAllowAal1 } from '../middleware/auth.js'
import { signStepUpToken, getStepUpTtlSeconds } from '../utils/stepUp.js'
import {
  hasVerifiedFactor,
  verifiedFactors,
  enrollTotp,
  challengeTotp,
  verifyTotp,
  unenrollFactor,
} from '../utils/mfa.js'
import { logAudit } from './admin.js'
import logger from '../utils/logger.js'

const router = Router()

function bearerToken(req) {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

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
    // Audit trail: a staff/admin sign-in is a security event - record when
    // and where (IP + device). Customer logins stay out of the audit log.
    // When MFA is enrolled the row is written by /mfa-verify after the second
    // factor succeeds, so a password-only attempt is never recorded as a
    // completed sign-in.
    let mfaRequired = hasVerifiedFactor(data.user) || hasVerifiedFactor(data.session?.user)
    if (!mfaRequired) {
      try {
        const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.session.user.id })
        mfaRequired = (factors?.factors || []).some((f) => f.status === 'verified')
      } catch (factorErr) {
        logger.warn({ err: factorErr }, 'MFA factor lookup failed during login')
      }
    }
    let role = 'user'
    try {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle()
      role = prof?.role || 'user'

      if (!mfaRequired && (role === 'admin' || role === 'staff')) {
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

    // Admin-panel roles must enroll a second factor before the panel opens;
    // customers may opt in voluntarily from their profile.
    const mfaEnrollmentRequired = (role === 'admin' || role === 'staff') && !mfaRequired

    // The session is returned even when MFA is required: it is an aal1 session
    // that every protected API route rejects until /mfa-verify upgrades it to
    // aal2. The client needs it to run the GoTrue challenge.
    res.json({
      session: data.session,
      mfa_required: mfaRequired,
      mfa_enrollment_required: mfaEnrollmentRequired,
    })
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

// ---------------------------------------------------------------------------
// Two-factor authentication (Supabase-native TOTP)
//
// The secret, challenge and verification all live in Supabase Auth (GoTrue).
// The backend's job is to (a) proxy enrollment/verification so the browser
// never needs to manage a second Supabase client, and (b) enforce the aal2
// assurance level on protected routes (see middleware/auth.js).
// ---------------------------------------------------------------------------

// Starts enrollment: returns the QR code and manual secret for the
// authenticator app. Nothing is enabled until /mfa/verify succeeds.
router.post('/mfa/enroll', authAllowAal1, async (req, res) => {
  if (req.mfaEnabled) {
    return res.status(409).json({
      error: 'Two-factor authentication is already turned on. Turn it off first.',
      code: 'MFA_ALREADY_ENABLED',
    })
  }
  try {
    // A user who abandoned setup can retry; clear stale unverified factors so
    // GoTrue's factor cap is never hit. Best-effort: never block enrollment.
    try {
      const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: req.userId })
      for (const factor of data?.factors || []) {
        if (factor.status === 'unverified') {
          await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: req.userId, id: factor.id })
        }
      }
    } catch (cleanupErr) {
      logger.warn({ err: cleanupErr }, 'MFA stale-factor cleanup failed')
    }

    const data = await enrollTotp(bearerToken(req))
    res.json({
      factorId: data.id,
      secret: data.totp?.secret || '',
      qrCode: data.totp?.qr_code || '',
      uri: data.totp?.uri || '',
    })
  } catch (err) {
    logger.error({ err }, 'MFA enrollment error')
    if (err.status === 429) {
      return res.status(429).json({ error: 'Too many attempts. Please try again shortly.' })
    }
    res.status(502).json({ error: 'Could not start two-factor setup. Please try again.' })
  }
})

// Verifies a 6-digit code. Used both to finish enrollment (the factor is still
// unverified) and to complete a login (the factor is already verified). On
// success GoTrue returns an upgraded aal2 session that the client installs.
router.post('/mfa/verify', authAllowAal1, mfaLimiter, async (req, res) => {
  const code = String(req.body?.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app.' })
  }

  const factors = (req.userFactorsAll || []).filter((f) => f.factor_type === 'totp')
  const factor = factors.find((f) => f.status === 'verified') || factors.find((f) => f.status === 'unverified')
  if (!factor) {
    return res.status(400).json({ error: 'Two-factor authentication is not set up for this account.' })
  }
  const completingEnrollment = factor.status === 'unverified'

  try {
    const challenge = await challengeTotp(bearerToken(req), factor.id)
    const session = await verifyTotp(bearerToken(req), factor.id, challenge.id, code)

    if (completingEnrollment) {
      await logAudit({
        adminEmail: req.userEmail,
        action: 'mfa_enabled',
        target: `user:${req.userId}`,
      })
    } else if (req.userRole === 'admin' || req.userRole === 'staff') {
      await logAudit({
        adminEmail: req.userEmail,
        action: 'sign_in',
        target: `user:${req.userId}`,
        changes: {
          role: req.userRole,
          ip: clientIp(req),
          user_agent: (req.get('user-agent') || '').slice(0, 300) || null,
          mfa: 'totp',
        },
      })
    }

    res.json({ session })
  } catch (err) {
    const invalid = [400, 401, 403, 422].includes(err.status)
    logger.warn({ code: err.code, status: err.status }, 'MFA verification failed')
    if (invalid) {
      return res.status(401).json({ error: 'Invalid code. Check your authenticator app and try again.' })
    }
    res.status(502).json({ error: 'Could not verify the code right now. Please try again.' })
  }
})

// Turns MFA off by removing the verified factors. authMiddleware requires an
// aal2 session here, so a password-only attacker cannot disable it.
router.post('/mfa/unenroll', authMiddleware, async (req, res) => {
  const factors = verifiedFactors({ factors: req.userFactorsAll })
  if (factors.length === 0) {
    return res.status(400).json({ error: 'Two-factor authentication is not turned on.' })
  }
  try {
    for (const factor of factors) {
      await unenrollFactor(bearerToken(req), factor.id)
    }
    await logAudit({
      adminEmail: req.userEmail,
      action: 'mfa_disabled',
      target: `user:${req.userId}`,
    })
    res.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'MFA unenroll error')
    res.status(502).json({ error: 'Could not turn off two-factor authentication. Please try again.' })
  }
})

export default router
