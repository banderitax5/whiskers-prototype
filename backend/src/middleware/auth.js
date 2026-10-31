import { createClient } from '@supabase/supabase-js'
import { supabaseAuth } from '../config/supabase.js'
import { verifyStepUpToken } from '../utils/stepUp.js'
import { aalFromToken, hasVerifiedFactor } from '../utils/mfa.js'
import { AUTH_REQUIRED, SESSION_EXPIRED, ADMIN_ONLY, STAFF_ONLY } from '../utils/messages.js'

// Verifies the Bearer token, attaches userId, userEmail, userRole, and req.db to req
// req.db is a Supabase client scoped to the authenticated user — RLS policies are enforced
async function authenticate(req, res, next, { enforceAal = true } = {}) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: AUTH_REQUIRED })
  }
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: SESSION_EXPIRED })
  }
  req.userId = user.id
  req.userEmail = user.email
  // GoTrue returns the account's MFA factors on GET /user, so this needs no
  // database column and cannot drift from the real enrollment state.
  req.mfaEnabled = hasVerifiedFactor(user)
  req.userFactorsAll = Array.isArray(user.factors) ? user.factors : []

  // create a user-scoped client so RLS policies see auth.uid()
  req.db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: profile } = await req.db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  req.userRole = profile?.role || 'user'

  // Password-only (aal1) sessions are refused for accounts with a verified
  // factor. This is the enforcement point that makes MFA meaningful: a stolen
  // password cannot call the API even if the attacker talks to GoTrue directly.
  // The MFA verification routes opt out because they run before the upgrade.
  if (enforceAal && req.mfaEnabled && aalFromToken(token) !== 'aal2') {
    return res.status(403).json({
      error: 'Two-factor authentication required.',
      code: 'MFA_REQUIRED',
    })
  }

  next()
}

export function authMiddleware(req, res, next) {
  return authenticate(req, res, next, { enforceAal: true })
}

// For the few auth routes that must accept the aal1 session: MFA verification
// (the whole point is to upgrade it) and enrollment (no factor exists yet).
export function authAllowAal1(req, res, next) {
  return authenticate(req, res, next, { enforceAal: false })
}

export function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: ADMIN_ONLY })
  }
  next()
}

// the back office also serves a staff role (orders, products, support, payments view);
export function requireStaff(req, res, next) {
  if (req.userRole !== 'admin' && req.userRole !== 'staff') {
    return res.status(403).json({ error: STAFF_ONLY })
  }
  next()
}

// Requires a recent password re-verification for sensitive admin actions.
// The token is issued by POST /api/auth/step-up and is bound to req.userId.
// Must run after authMiddleware.
export function requireStepUp(req, res, next) {
  const token = req.headers['x-step-up-token']
  if (!token || !verifyStepUpToken(token, req.userId)) {
    return res.status(403).json({
      error: 'Additional verification required for this action.',
      code: 'STEP_UP_REQUIRED',
    })
  }
  next()
}
