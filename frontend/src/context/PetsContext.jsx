/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import supabase from '../lib/supabase'

// this context manages the list of pets per user
// since the backend routes are still stubbed, we persist to localStorage
// keyed by the user's supabase id so each account has its own pet list
// when the backend is ready we swap the localStorage calls for API calls
// and keep the same interface so downstream components don't change
const PetsContext = createContext(null)

const STORAGE_PREFIX = 'whiskers:pets:'

function storageKeyFor(userId) {
  return `${STORAGE_PREFIX}${userId || 'guest'}`
}

function loadPetsFromStorage(userId) {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePetsToStorage(userId, pets) {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(pets))
  } catch {
    // storage full or disabled, silently skip
  }
}

export function PetsProvider({ children }) {
  const [session, setSession] = useState(null)
  const [pets, setPets] = useState([])
  const [activePetId, setActivePetId] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    const loaded = loadPetsFromStorage(userId)
    setPets(loaded)
    if (loaded.length > 0 && !activePetId) {
      setActivePetId(loaded[0].id)
    }
    if (loaded.length === 0) {
      setActivePetId(null)
    }
  }, [session, activePetId])

  const addPet = useCallback((pet) => {
    const userId = session?.user?.id
    const newPet = {
      id: `pet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...pet,
    }
    setPets((prev) => {
      const next = [...prev, newPet]
      savePetsToStorage(userId, next)
      return next
    })
    setActivePetId(newPet.id)
    return newPet
  }, [session])

  const updatePet = useCallback((petId, updates) => {
    const userId = session?.user?.id
    setPets((prev) => {
      const next = prev.map((p) => (p.id === petId ? { ...p, ...updates } : p))
      savePetsToStorage(userId, next)
      return next
    })
  }, [session])

  const removePet = useCallback((petId) => {
    const userId = session?.user?.id
    setPets((prev) => {
      const next = prev.filter((p) => p.id !== petId)
      savePetsToStorage(userId, next)
      if (activePetId === petId) {
        setActivePetId(next[0]?.id || null)
      }
      return next
    })
  }, [session, activePetId])

  const getActivePet = useCallback(() => {
    return pets.find((p) => p.id === activePetId) || null
  }, [pets, activePetId])

  const value = {
    pets,
    activePetId,
    setActivePetId,
    addPet,
    updatePet,
    removePet,
    getActivePet,
    isAuthenticated: !!session,
    userEmail: session?.user?.email || null,
  }

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>
}

export function usePets() {
  const ctx = useContext(PetsContext)
  if (!ctx) throw new Error('usePets must be used inside PetsProvider')
  return ctx
}
