import { useCallback, useEffect, useState } from 'react'
import { getHealth } from '../lib/api'

export function useHealth() {
  const [status, setStatus] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

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

  useEffect(() => {
    check()
  }, [check])

  return { status, errorMessage, isLoading, check }
}


