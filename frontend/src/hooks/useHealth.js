import { useCallback, useEffect, useState } from 'react'
import { getHealth } from '../lib/api'

// custom hook that pings the backend's /health endpoint
// useful for checking if the server is up and running
// returns the health status, any error message, loading state,
// and a check() function you can call to manually re-check
export function useHealth() {
  const [status, setStatus] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // hits GET /api/health and stores the response
  // if the backend is down or unreachable, catches the error
  const check = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const data = await getHealth()
      setStatus(data)
    } catch (err) {
      setErrorMessage(err.message ?? 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // runs the health check once when the component using this hook mounts
  useEffect(() => {
    check()
  }, [check])

  return { status, errorMessage, isLoading, check }
}
