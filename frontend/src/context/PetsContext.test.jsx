// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// the auth stub lets a test pretend somebody signs in or out mid-session
const { auth, api } = vi.hoisted(() => ({
  auth: { listener: null, session: null },
  api: { rows: [], failWith: null, calls: [] },
}))

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.session } }),
      onAuthStateChange: (cb) => {
        auth.listener = cb
        return { data: { subscription: { unsubscribe: () => { auth.listener = null } } } }
      },
    },
  },
}))

// a stand-in for the pets API that keeps rows in memory, so the test exercises
// the same request/response shapes the real routes produce
vi.mock('../lib/api', () => {
  const fail = () => {
    const err = new Error(api.failWith.error)
    err.status = api.failWith.status
    err.code = api.failWith.code
    throw err
  }
  const toClient = (row) => ({
    id: row.pet_id,
    name: row.name,
    species: row.species,
    lifeStage: row.life_stage,
    stageSource: row.stage_source,
    birthDate: row.birth_date,
    weight: row.weight_kg,
    neutered: row.neutered,
    healthCondition: row.health_condition,
    allergies: row.allergies.length ? row.allergies : ['none'],
    createdAt: row.created_at,
  })
  return {
    apiGetAuth: async (path) => {
      api.calls.push(['GET', path])
      if (api.failWith) fail()
      return { items: api.rows.map(toClient) }
    },
    apiPostAuth: async (path, body) => {
      api.calls.push(['POST', path, body])
      if (api.failWith) fail()
      const row = {
        pet_id: `00000000-0000-4000-8000-${String(api.rows.length + 1).padStart(12, '0')}`,
        name: body.name,
        species: body.species,
        life_stage: body.lifeStage,
        stage_source: body.stageSource,
        birth_date: body.birthDate,
        weight_kg: body.weight,
        neutered: body.neutered,
        health_condition: body.healthCondition,
        allergies: body.allergies,
        created_at: new Date().toISOString(),
      }
      api.rows.push(row)
      return { pet: toClient(row) }
    },
    apiPutAuth: async (path, body) => {
      api.calls.push(['PUT', path, body])
      if (api.failWith) fail()
      const id = path.split('/').pop()
      const row = api.rows.find((r) => r.pet_id === id)
      Object.assign(row, {
        name: body.name,
        species: body.species,
        life_stage: body.lifeStage,
        stage_source: body.stageSource,
        birth_date: body.birthDate,
        weight_kg: body.weight,
        neutered: body.neutered,
        health_condition: body.healthCondition,
        allergies: body.allergies,
      })
      return { pet: toClient(row) }
    },
    apiDeleteAuth: async (path) => {
      api.calls.push(['DELETE', path])
      if (api.failWith) fail()
      const id = path.split('/').pop()
      api.rows = api.rows.filter((r) => r.pet_id !== id)
      return { ok: true }
    },
  }
})

import { PetsProvider, usePets } from './PetsContext.jsx'

const GUEST_KEY = 'whiskers:pets:guest'
const USER_ID = '8f1d3c2e-0000-4000-8000-00000000aaaa'
const ACCOUNT_KEY = `whiskers:pets:${USER_ID}`

const SESSION = { user: { id: USER_ID, email: 'owner@example.com' }, access_token: 'token-1' }

let ctx = null
let cleanup = () => {}

function Probe() {
  ctx = usePets()
  return <div data-count={ctx.pets.length} />
}

async function renderPets() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<PetsProvider><Probe /></PetsProvider>)
  })
  // flush getSession(), then the load effect
  await act(async () => {})
  await act(async () => {})
  cleanup = () => act(() => root.unmount())
  return container
}

// the shape a saved pet has in the browser
function pet(id, name) {
  return {
    id,
    name,
    species: 'dog',
    lifeStage: 'adult',
    healthCondition: 'healthy',
    allergies: ['none'],
  }
}

// the shape the server keeps
function row(n, name) {
  return {
    pet_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name,
    species: 'dog',
    life_stage: 'adult',
    stage_source: 'manual',
    birth_date: null,
    weight_kg: null,
    neutered: 'unknown',
    health_condition: 'healthy',
    allergies: [],
    created_at: `2026-01-0${n}T00:00:00.000Z`,
  }
}

function seed(key, pets) {
  localStorage.setItem(key, JSON.stringify(pets))
}

function stored(key) {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
  auth.session = null
  auth.listener = null
  api.rows = []
  api.failWith = null
  api.calls = []
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  cleanup = () => {}
  ctx = null
  document.body.innerHTML = ''
})

describe('a visitor without an account', () => {
  it('loads the pets saved in this browser', async () => {
    seed(GUEST_KEY, [pet('pet-1', 'Mochi')])
    await renderPets()

    expect(ctx.hydrated).toBe(true)
    expect(ctx.isAuthenticated).toBe(false)
    expect(ctx.pets.map((p) => p.name)).toEqual(['Mochi'])
    expect(ctx.getActivePet()?.name).toBe('Mochi')
    // a guest never calls the server
    expect(api.calls).toEqual([])
  })

  it('saves a new pet under the guest key, no account needed', async () => {
    await renderPets()

    await act(async () => {
      await ctx.addPet(pet('pet-2', 'Kopi'))
    })

    expect(stored(GUEST_KEY).map((p) => p.name)).toEqual(['Kopi'])
    expect(ctx.getActivePet()?.name).toBe('Kopi')
    expect(ctx.isAuthenticated).toBe(false)
  })

  it('removes a pet from this browser', async () => {
    seed(GUEST_KEY, [pet('pet-1', 'Mochi'), pet('pet-2', 'Kopi')])
    await renderPets()

    await act(async () => {
      ctx.setActivePetId('pet-2')
      await ctx.removePet('pet-2')
    })

    expect(stored(GUEST_KEY).map((p) => p.name)).toEqual(['Mochi'])
    expect(ctx.getActivePet()?.name).toBe('Mochi')
  })
})

describe('a signed-in account', () => {
  it('reads the pets from the server, not from this browser', async () => {
    auth.session = SESSION
    api.rows = [row(1, 'Bruno')]
    // a stale browser copy must be ignored when the server answers
    seed(ACCOUNT_KEY, [pet('pet-1', 'Old')])
    await renderPets()

    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.pets.map((p) => p.name)).toEqual(['Bruno'])
    expect(ctx.localOnly).toBe(false)
  })

  it('saves a new pet to the server', async () => {
    auth.session = SESSION
    await renderPets()

    await act(async () => {
      await ctx.addPet(pet('pet-1', 'Kopi'))
    })

    expect(api.calls.some((c) => c[0] === 'POST' && c[1] === '/pets')).toBe(true)
    expect(api.rows.map((r) => r.name)).toEqual(['Kopi'])
    expect(ctx.pets.map((p) => p.name)).toEqual(['Kopi'])
  })

  it('sends "none" as an empty allergy list and drops unknown values', async () => {
    auth.session = SESSION
    await renderPets()

    await act(async () => {
      await ctx.addPet({ ...pet('pet-1', 'Mochi'), allergies: ['none', 'chicken', 'mystery'] })
    })

    expect(api.rows[0].allergies).toEqual(['chicken'])
  })

  it('updates and removes a pet on the server', async () => {
    auth.session = SESSION
    api.rows = [row(1, 'Bruno')]
    await renderPets()

    await act(async () => {
      await ctx.updatePet(ctx.pets[0].id, { name: 'Bruno Jr' })
    })
    expect(api.rows[0].name).toBe('Bruno Jr')

    await act(async () => {
      await ctx.removePet(ctx.pets[0].id)
    })
    expect(api.rows).toEqual([])
    expect(ctx.pets).toEqual([])
  })

  it('moves a visitor\'s pets into an empty account', async () => {
    seed(GUEST_KEY, [pet('pet-1', 'Mochi')])
    await renderPets()

    await act(async () => {
      auth.listener('SIGNED_IN', SESSION)
    })
    await act(async () => {})

    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.pets.map((p) => p.name)).toEqual(['Mochi'])
    expect(api.rows.map((r) => r.name)).toEqual(['Mochi'])
    // only one copy is kept, so signing out does not show a duplicate
    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
  })

  it('never overwrites pets an account already has', async () => {
    seed(GUEST_KEY, [pet('pet-1', 'Mochi')])
    auth.session = SESSION
    api.rows = [row(9, 'Bruno')]
    await renderPets()

    expect(ctx.pets.map((p) => p.name)).toEqual(['Bruno'])
    // the visitor list is left where it is instead of being thrown away
    expect(stored(GUEST_KEY).map((p) => p.name)).toEqual(['Mochi'])
    expect(api.calls.some((c) => c[0] === 'POST')).toBe(false)
  })

  it('keeps account pets on the server when the owner signs out', async () => {
    auth.session = SESSION
    api.rows = [row(9, 'Bruno')]
    await renderPets()

    expect(ctx.pets.map((p) => p.name)).toEqual(['Bruno'])

    await act(async () => {
      auth.listener('SIGNED_OUT', null)
    })
    await act(async () => {})

    expect(ctx.isAuthenticated).toBe(false)
    expect(ctx.pets).toEqual([])
    // signing back in finds them again, because they never left the server
    expect(api.rows.map((r) => r.name)).toEqual(['Bruno'])
  })

  it('falls back to this browser, and says so, when the table is missing', async () => {
    auth.session = SESSION
    api.failWith = { status: 503, code: 'MIGRATION_REQUIRED', error: 'Waiting on a database update.' }
    seed(ACCOUNT_KEY, [pet('pet-1', 'Mochi')])
    await renderPets()

    expect(ctx.pets.map((p) => p.name)).toEqual(['Mochi'])
    expect(ctx.localOnly).toBe(true)
  })

  it('still saves locally while the table is missing', async () => {
    auth.session = SESSION
    api.failWith = { status: 503, code: 'MIGRATION_REQUIRED', error: 'Waiting on a database update.' }
    seed(ACCOUNT_KEY, [pet('pet-1', 'Mochi')])
    await renderPets()

    await act(async () => {
      await ctx.addPet(pet('pet-2', 'Kopi'))
    })

    expect(stored(ACCOUNT_KEY).map((p) => p.name)).toEqual(['Mochi', 'Kopi'])
  })

  it('puts the previous list back when a save fails', async () => {
    auth.session = SESSION
    api.rows = [row(1, 'Bruno')]
    await renderPets()

    api.failWith = { status: 500, code: 'BOOM', error: 'Could not save this pet.' }
    await act(async () => {
      await expect(ctx.addPet(pet('pet-2', 'Kopi'))).rejects.toThrow()
    })

    expect(ctx.pets.map((p) => p.name)).toEqual(['Bruno'])
  })
})

describe('a pet that has grown up since the last visit', () => {
  it('moves a saved puppy to the stage the birth date gives today', async () => {
    seed(GUEST_KEY, [
      {
        ...pet('pet-1', 'Mochi'),
        birthDate: '2010-01-01',
        lifeStage: 'puppy',
        stageSource: 'birthDate',
      },
    ])
    await renderPets()

    expect(ctx.pets[0].lifeStage).toBe('senior')
    expect(stored(GUEST_KEY)[0].lifeStage).toBe('senior')
  })

  it('keeps a stage the owner chose by hand', async () => {
    seed(GUEST_KEY, [
      {
        ...pet('pet-1', 'Mochi'),
        birthDate: '2010-01-01',
        lifeStage: 'adult',
        stageSource: 'manual',
      },
    ])
    await renderPets()

    expect(ctx.pets[0].lifeStage).toBe('adult')
  })
})

describe('damaged storage', () => {
  it('survives text that is not a pet list', async () => {
    localStorage.setItem(GUEST_KEY, 'not json at all')
    await renderPets()
    expect(ctx.pets).toEqual([])
    expect(ctx.hydrated).toBe(true)
  })

  it('drops entries that are not pets', async () => {
    seed(GUEST_KEY, [pet('pet-1', 'Mochi'), { name: 'no id' }, null, 'nope'])
    await renderPets()
    expect(ctx.pets.map((p) => p.name)).toEqual(['Mochi'])
  })
})
