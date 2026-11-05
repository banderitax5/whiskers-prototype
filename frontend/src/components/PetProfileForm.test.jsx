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
