// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import PetProfileForm from './PetProfileForm.jsx'

let cleanup = () => {}

async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  cleanup = () => act(() => root.unmount())
  return container
}

// a saved pet with everything the form needs, plus whatever allergies a test wants
function savedPet(allergies) {
  return {
    id: 'pet-1',
    name: 'Mochi',
    species: 'dog',
    lifeStage: 'adult',
    healthCondition: 'healthy',
    allergies,
  }
}

function checkboxFor(container, label) {
  const row = [...container.querySelectorAll('label')].find((l) =>
    l.textContent.trim() === label
  )
  return row ? row.querySelector('input[type="checkbox"]') : null
}

async function submit(container) {
  const form = container.querySelector('form')
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  cleanup()
  cleanup = () => {}
  document.body.innerHTML = ''
})

describe('PetProfileForm: allergies saved by an older build', () => {
  it('ticks the current option for an older name', async () => {
    const container = await render(<PetProfileForm initialPet={savedPet(['wheat', 'seafood'])} />)
    expect(checkboxFor(container, 'Grain / Wheat').checked).toBe(true)
    expect(checkboxFor(container, 'Fish / Seafood').checked).toBe(true)
    expect(checkboxFor(container, 'Chicken').checked).toBe(false)
  })

  it('saves the current name back, so the old value is upgraded', async () => {
    const onSubmit = vi.fn()
    const container = await render(
      <PetProfileForm initialPet={savedPet(['wheat', 'seafood'])} onSubmit={onSubmit} />
    )
    await submit(container)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].allergies).toEqual(['grain', 'fish'])
  })

  it('keeps a value it has no checkbox for, and says so in words', async () => {
    const container = await render(
      <PetProfileForm initialPet={savedPet(['chicken', 'mystery-code'])} />
    )
    expect(container.textContent).toContain('Mystery code')
    expect(container.textContent).not.toContain('mystery-code')
    expect(checkboxFor(container, 'Chicken').checked).toBe(true)
  })

  it('does not quietly drop that value when the profile is saved', async () => {
    const onSubmit = vi.fn()
    const container = await render(
      <PetProfileForm initialPet={savedPet(['chicken', 'mystery-code'])} onSubmit={onSubmit} />
    )
    await submit(container)
    expect(onSubmit.mock.calls[0][0].allergies).toEqual(['chicken', 'mystery-code'])
  })

  it('lets the owner remove that value on purpose', async () => {
    const onSubmit = vi.fn()
    const container = await render(
      <PetProfileForm initialPet={savedPet(['chicken', 'mystery-code'])} onSubmit={onSubmit} />
    )
    const remove = container.querySelector('button[aria-label="Remove Mystery code"]')
    expect(remove).toBeTruthy()
    await act(async () => { remove.click() })
    await submit(container)
    expect(onSubmit.mock.calls[0][0].allergies).toEqual(['chicken'])
  })
})

async function choose(container, id, value) {
  const select = container.querySelector(`#${id}`)
  expect(select).toBeTruthy()
  select.value = value
  await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })) })
}

describe('PetProfileForm: daily life', () => {
  it('asks a dog about activity and breed size, but not where it lives', async () => {
    const container = await render(<PetProfileForm initialPet={savedPet(['none'])} />)
    expect(container.textContent).toContain('Daily life')
    expect(container.querySelector('#petActivity')).toBeTruthy()
    expect(container.querySelector('#petBreedSize')).toBeTruthy()
    expect(container.querySelector('#petEnvironment')).toBeNull()
  })

  it('asks a cat about activity and where it lives, but not its breed size', async () => {
    const container = await render(
      <PetProfileForm initialPet={{ ...savedPet(['none']), species: 'cat', lifeStage: 'adult' }} />
    )
    expect(container.querySelector('#petActivity')).toBeTruthy()
    expect(container.querySelector('#petEnvironment')).toBeTruthy()
    expect(container.querySelector('#petBreedSize')).toBeNull()
  })

  it('does not ask a bird, and saves the neutral answers', async () => {
    const onSubmit = vi.fn()
    const container = await render(
      <PetProfileForm
        initialPet={{ ...savedPet(['none']), species: 'bird', lifeStage: 'adult' }}
        onSubmit={onSubmit}
      />
    )
    expect(container.textContent).not.toContain('Daily life')
    await submit(container)
    const saved = onSubmit.mock.calls[0][0]
    expect(saved.activity).toBe('normal')
    expect(saved.environment).toBe('both')
    expect(saved.breedSize).toBe('unknown')
  })

  it('starts a dog on the neutral answers', async () => {
    const onSubmit = vi.fn()
    const container = await render(<PetProfileForm initialPet={savedPet(['none'])} onSubmit={onSubmit} />)
    await submit(container)
    const saved = onSubmit.mock.calls[0][0]
    expect(saved.activity).toBe('normal')
    expect(saved.environment).toBe('both')
    expect(saved.breedSize).toBe('unknown')
  })

  it('saves the answers the owner picked', async () => {
    const onSubmit = vi.fn()
    const container = await render(<PetProfileForm initialPet={savedPet(['none'])} onSubmit={onSubmit} />)
    await choose(container, 'petActivity', 'high')
    await choose(container, 'petBreedSize', 'large')
    await submit(container)
    const saved = onSubmit.mock.calls[0][0]
    expect(saved.activity).toBe('high')
    expect(saved.breedSize).toBe('large')
    // a dog is never asked where it lives
    expect(saved.environment).toBe('both')
  })

  it('opens an edited cat on its saved answers and saves them back', async () => {
    const onSubmit = vi.fn()
    const pet = {
      ...savedPet(['none']),
      species: 'cat',
      lifeStage: 'adult',
      activity: 'low',
      environment: 'indoor',
    }
    const container = await render(<PetProfileForm initialPet={pet} onSubmit={onSubmit} />)
    expect(container.querySelector('#petActivity').value).toBe('low')
    expect(container.querySelector('#petEnvironment').value).toBe('indoor')
    await submit(container)
    const saved = onSubmit.mock.calls[0][0]
    expect(saved.activity).toBe('low')
    expect(saved.environment).toBe('indoor')
  })
})
