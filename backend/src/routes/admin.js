import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { count: userCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    res.json({ totalUsers: userCount ?? 0 })
  } catch (err) {
    console.error('Admin stats error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
