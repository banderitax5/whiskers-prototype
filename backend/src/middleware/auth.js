import { supabaseAuth, supabaseAdmin } from '../config/supabase.js'

// Verifies the Bearer token, attaches userId, userEmail, and userRole to req
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
