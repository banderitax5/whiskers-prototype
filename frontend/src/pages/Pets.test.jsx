// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// the pets page only needs a pet list from context; the form and the results
// panel are stubbed so the test reads as the summary line and nothing else
const { petsState } = vi.hoisted(() => ({
  petsState: {
    pets: [],
    activePetId: null,
    isAuthenticated: false,
    hydrated: true,
    loadError: '',
    retryLoad: vi.fn(),
    setActivePetId: vi.fn(),
    addPet: vi.fn(),
    updatePet: vi.fn(),
    removePet: vi.fn(),
    getActivePet: () => null,
  },
}))

vi.mock('../context/PetsContext.jsx', () => ({
  usePets: () => petsState,
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => ({ openLogin: vi.fn() }),
}))

vi.mock('../components/PetProfileForm.jsx', () => ({
  default: ({ initialPet }) => (
    <div data-testid="pet-form">{initialPet ? `Edit ${initialPet.name}` : 'Add a pet'}</div>
  ),
}))

vi.mock('../components/RecommendationResults.jsx', () => ({
  default: ({ pet }) => <div data-testid="results">{pet.name}</div>,
}))

vi.mock('../components/ConfirmModal.jsx', () => ({
  default: () => null,
}))

import Pets from './Pets.jsx'

let cleanup = () => {}

function pet(overrides = {}) {
  return {
    id: 'pet-1',
    name: 'Mochi',
    species: 'dog',
    lifeStage: 'adult',
    healthCondition: 'healthy',
    allergies: ['none'],
    ...overrides,
  }
}

async function renderWith(pets) {
  const active = pets[0] || null
  petsState.pets = pets
  petsState.activePetId = active?.id || null
  petsState.getActivePet = () => active

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<Pets />) })
  cleanup = () => act(() => root.unmount())
  return container
}

// the summary line, with newlines and repeated spaces flattened
function avoidingText(container) {
  const line = [...container.querySelectorAll('p')].find((p) =>
    p.textContent.trim().startsWith('Avoiding:')
  )
  return line ? line.textContent.replace(/\s+/g, ' ').trim() : null
}

// the facts line under the pet's name (species, stage, weight, daily life)
function factsText(container) {
  const line = [...container.querySelectorAll('p')].find((p) =>
    p.textContent.includes(' · ')
  )
  return line ? line.textContent.replace(/\s+/g, ' ').trim() : null
}

beforeEach(() => {
  petsState.pets = []
  petsState.activePetId = null
  petsState.isAuthenticated = false
  petsState.loadError = ''
  petsState.retryLoad = vi.fn()
})

afterEach(() => {
  cleanup()
  cleanup = () => {}
  document.body.innerHTML = ''
})

describe('Pets page: allergy summary', () => {
  it('prints readable labels for the stored codes', async () => {
    const container = await renderWith([pet({ allergies: ['chicken', 'fish'] })])
    expect(avoidingText(container)).toBe('Avoiding: Chicken, Fish / Seafood')
  })

  it('does not print anything when the only value is "none"', async () => {
    const container = await renderWith([pet({ allergies: ['none'] })])
    expect(avoidingText(container)).toBeNull()
  })

  it('shows an older saved name as today\'s label', async () => {
    const container = await renderWith([pet({ allergies: ['wheat', 'seafood'] })])
    expect(avoidingText(container)).toBe('Avoiding: Grain / Wheat, Fish / Seafood')
  })

  it('shows an unknown saved value as words, never as a raw code', async () => {
    const container = await renderWith([pet({ allergies: ['sensitive-stomach'] })])
    const text = avoidingText(container)
    expect(text).toBe('Avoiding: Sensitive stomach')
    expect(text).not.toContain('sensitive-stomach')
  })
})

describe('Pets page: daily-life facts', () => {
  it('shows the answers the owner chose', async () => {
    const container = await renderWith([pet({ activity: 'high', breedSize: 'large' })])
    const text = factsText(container)
    expect(text).toContain('High activity')
    expect(text).toContain('Large breed')
  })

  it('leaves out the neutral answers, so the line stays short', async () => {
    const container = await renderWith([
      pet({ activity: 'normal', environment: 'both', breedSize: 'unknown' }),
    ])
    const text = factsText(container)
    expect(text).not.toContain('Normal activity')
    expect(text).not.toContain('Indoor and outdoor')
    expect(text).not.toContain('Not sure')
  })

  it('shows where an indoor cat lives but never a breed size', async () => {
    const container = await renderWith([
      pet({ species: 'cat', lifeStage: 'adult', environment: 'indoor', breedSize: 'large' }),
    ])
    const text = factsText(container)
    expect(text).toContain('Indoor only')
    expect(text).not.toContain('Large breed')
  })

  it('never prints a daily-life answer the species is not asked about', async () => {
    const container = await renderWith([
      pet({ species: 'bird', lifeStage: 'adult', activity: 'high', environment: 'indoor', breedSize: 'small' }),
    ])
    const text = factsText(container)
    expect(text).not.toContain('High activity')
    expect(text).not.toContain('Indoor only')
    expect(text).not.toContain('Small breed')
  })
})

describe('Pets page: a failed first load', () => {
  it('shows the server message with a way to try again', async () => {
    petsState.loadError = 'Something went wrong on our side. Please try again in a moment.'
    const container = await renderWith([])

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert.textContent).toContain('Something went wrong on our side.')

    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Try again')
    expect(retry).not.toBeUndefined()
    await act(async () => { retry.click() })
    expect(petsState.retryLoad).toHaveBeenCalledTimes(1)
  })

  it('does not show an empty account behind the alert', async () => {
    petsState.loadError = 'Could not load your pets. Please try again.'
    const container = await renderWith([])

    const text = container.textContent
    expect(text).not.toContain('No pets yet')
    expect(text).not.toContain('Add My First Pet')
    expect(text).not.toContain('Welcome!')
  })
})
