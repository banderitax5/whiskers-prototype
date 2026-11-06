/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import supabase from '../lib/supabase'
import { apiGetAuth, apiPostAuth, apiPutAuth, apiDeleteAuth } from '../lib/api'
import { withCurrentLifeStage } from '../lib/petAge'
import { toServerPet } from '../lib/petProfileApi'
import { friendlyMessage } from '../lib/errors'

// this context manages the list of pets.
//
// Signed in: the pets belong to the account and live in the server database
// (table `pets`), so they survive clearing browser data and follow the owner to
// another device.
//
// Signed out: there is no account to attach the pets to, so a visitor's pets
// stay in this browser (localStorage) and move into the account the first time
// they sign in on this device.
//
// If the pets table has not been created yet, the server answers 503 and the
// page falls back to local storage, with a notice saying so rather than
// pretending the profile was saved to the account.
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
    if (!Array.isArray(parsed)) return []
    // skip anything that is not a pet, e.g. hand-edited or older storage
    return parsed.filter((p) => p && typeof p === 'object' && typeof p.id === 'string')
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

function clearPetsFromStorage(userId) {
  try {
    localStorage.removeItem(storageKeyFor(userId))
  } catch {
    // storage disabled, nothing to clear
  }
}

async function tokenOrNull() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

export function PetsProvider({ children }) {
  const [session, setSession] = useState(null)
  // false until supabase has told us whether somebody is signed in, so the page
  // does not flash the guest list before the account list arrives
  const [sessionReady, setSessionReady] = useState(false)
  const [pets, setPets] = useState([])
  const [activePetId, setActivePetId] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  // true when the signed-in list had to fall back to this browser because the
  // server database is not ready yet
  const [localOnly, setLocalOnly] = useState(false)
  // a failed first load must not look like "this account has no pets"
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const hydratedForRef = useRef(null)

  const userId = session?.user?.id || null

  useEffect(() => {
    let alive = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return
        setSession(data?.session ?? null)
        setSessionReady(true)
      })
      .catch(() => {
        // offline or auth unavailable: carry on as a guest
        if (alive) setSessionReady(true)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionReady(true)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  // load once per account. Signed in reads the account's pets from the server;
  // a visitor reads this browser. A visitor who filled in a pet before signing
  // in keeps it: the guest list moves into an empty account, but never
  // overwrites pets the account already has.
  //
  // Only the account id is a dependency, not the session object: Supabase emits
  // a fresh session on every token refresh, and re-running this effect would
  // cancel the request that is already in flight (the guard below would then
  // skip the replacement, leaving `hydrated` false and the page on its skeleton
  // forever).
  useEffect(() => {
    if (!sessionReady) return
    if (hydratedForRef.current === (userId || 'guest')) return

    // The account is claimed only once the read settles, never at the start:
    // React can clean the effect up and run it again while the request is in
    // flight (StrictMode, a retry), and the replacement run must not be skipped
    // by a guard the cancelled run already set.
    let cancelled = false

    async function load() {
      setLoadError('')
      let list = []
      let fellBack = false

      if (userId) {
        const token = await tokenOrNull()
        try {
          const data = await apiGetAuth('/pets', token)
          list = Array.isArray(data.items) ? data.items : []
        } catch (err) {
          // 503 = the pets table is not in the database yet; keep the page
          // usable and be honest about where the profiles are
          fellBack = err?.code === 'MIGRATION_REQUIRED' || err?.status === 503
          list = loadPetsFromStorage(userId)
          if (!fellBack) throw err
        }

        // move a visitor's pets into an account that has none of its own
        if (list.length === 0 && !fellBack) {
          const guestPets = loadPetsFromStorage(null)
          if (guestPets.length > 0) {
            const moved = []
            for (const guestPet of guestPets) {
              try {
                const saved = await apiPostAuth('/pets', toServerPet(guestPet), token)
                moved.push(saved.pet)
              } catch {
                // one bad pet must not lose the others
              }
            }
            if (moved.length === guestPets.length) clearPetsFromStorage(null)
            list = moved
          }
        }
      } else {
        list = loadPetsFromStorage(null)
      }

      // a pet with a birth date can have moved to the next stage since the last
      // visit, so the saved stage is refreshed before anything is shown
      const current = list.map((pet) => withCurrentLifeStage(pet))

      if (!userId) {
        if (current.some((pet, i) => pet !== list[i])) savePetsToStorage(userId, current)
      } else if (fellBack) {
        savePetsToStorage(userId, current)
      }

      if (cancelled) return
      hydratedForRef.current = userId || 'guest'
      setLocalOnly(fellBack)
      setPets(current)
      setActivePetId((id) =>
        id && current.some((p) => p.id === id) ? id : current[0]?.id || null
      )
      setHydrated(true)
    }

    load().catch((err) => {
      if (cancelled) return
      // Never show an empty account after a failed read: that looks exactly like
      // "you have no pets" and hides the real problem.
      hydratedForRef.current = userId || 'guest'
      setPets([])
      setLoadError(friendlyMessage(err, 'Could not load your pets. Please try again.'))
      setHydrated(true)
    })

    return () => { cancelled = true }
  }, [sessionReady, userId, reloadToken])

  const persistLocal = useCallback((next) => {
    setPets(next)
    savePetsToStorage(userId, next)
  }, [userId])

  // let the page retry after a failed read without a full reload
  const retryLoad = useCallback(() => {
    hydratedForRef.current = null
    setLoadError('')
    setHydrated(false)
    setReloadToken((n) => n + 1)
  }, [])

  // Every write is optimistic: the screen updates at once, and a failed request
  // puts the previous list back and passes the error to the caller, which shows
  // it above the form.
  const addPet = useCallback(async (pet) => {
    const draft = {
      id: `pet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...pet,
    }

    if (!userId || localOnly) {
      const next = [...pets, draft]
      persistLocal(next)
      setActivePetId(draft.id)
      return draft
    }

    const token = await tokenOrNull()
    const saved = await apiPostAuth('/pets', toServerPet(pet), token)
    const created = { ...saved.pet, createdAt: saved.pet.createdAt || new Date().toISOString() }
    setPets((current) => [...current, created])
    setActivePetId(created.id)
    return created
  }, [pets, persistLocal, userId, localOnly])

  const updatePet = useCallback(async (petId, updates) => {
    const previous = pets
    const merged = previous.map((p) => (p.id === petId ? { ...p, ...updates } : p))
    setPets(merged)

    if (!userId || localOnly) {
      savePetsToStorage(userId, merged)
      return merged
    }

    const token = await tokenOrNull()
    try {
      const saved = await apiPutAuth(`/pets/${petId}`, toServerPet({ ...previous.find((p) => p.id === petId), ...updates }), token)
      setPets((current) => current.map((p) => (p.id === petId ? { ...p, ...saved.pet } : p)))
      return saved
    } catch (err) {
      setPets(previous)
      throw err
    }
  }, [pets, userId, localOnly])

  const removePet = useCallback(async (petId) => {
    const previous = pets
    const next = previous.filter((p) => p.id !== petId)
    setPets(next)
    setActivePetId((current) => (current === petId ? next[0]?.id || null : current))

    if (!userId || localOnly) {
      savePetsToStorage(userId, next)
      return
    }

    const token = await tokenOrNull()
    try {
      await apiDeleteAuth(`/pets/${petId}`, token)
    } catch (err) {
      setPets(previous)
      setActivePetId(petId)
      throw err
    }
  }, [pets, userId, localOnly])

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
    hydrated,
    // true when a signed-in account is showing browser-only pets because the
    // server database is not set up yet
    localOnly,
    // set when the first read failed; the page shows it instead of "no pets"
    loadError,
    retryLoad,
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
