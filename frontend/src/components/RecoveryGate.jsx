import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import supabase, { RECOVERY_PENDING_KEY } from '../lib/supabase'

// A recovery session must set a new password before it can be used anywhere
// else. While the pending flag is set, any navigation away from /reset is
// bounced back until the password is saved (or the session is gone).
function RecoveryGate() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.pathname === '/reset') return
    if (localStorage.getItem(RECOVERY_PENDING_KEY) !== '1') return

    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) navigate('/reset', { replace: true })
      else localStorage.removeItem(RECOVERY_PENDING_KEY)
    })

    return () => { cancelled = true }
  }, [location.pathname, navigate])

  return null
}

export default RecoveryGate
