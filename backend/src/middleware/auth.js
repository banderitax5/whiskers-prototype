import { createClient } from '@supabase/supabase-js'
import { supabaseAuth, supabaseAdmin } from '../config/supabase.js'

// Verifies the Bearer token, attaches userId, userEmail, userRole, and req.db to req
// req.db is a Supabase client scoped to the authenticated user — RLS policies are enforced
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  req.userId = user.id
  req.userEmail = user.email

  // create a user-scoped client so RLS policies see auth.uid()
  req.db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  req.userRole = profile?.role || 'user'

  next()
}

export function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
