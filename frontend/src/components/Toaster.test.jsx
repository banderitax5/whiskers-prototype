// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import FloatingNotification from './Toaster.jsx'
import toast, { dismiss, getToasts } from '../lib/toast.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  for (const item of getToasts()) dismiss(item.id)
  document.body.innerHTML = ''
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<FloatingNotification />) })
  cleanup = () => act(() => root.unmount())
  return container
}

describe('FloatingNotification', () => {
  it('renders a success toast with the message', async () => {
    const container = await render()

    await act(async () => { toast.success('Product created') })

    const status = container.querySelector('[role="status"]')
    expect(status).toBeTruthy()
    expect(status.textContent).toContain('Product created')
    // Tailwind classes, not injected CSS: the CSP blocks <style> elements.
    expect(container.querySelector('style')).toBeNull()
  })

  it('renders an error toast', async () => {
    const container = await render()
    await act(async () => { toast.error('Could not save') })

    expect(container.textContent).toContain('Could not save')
    expect(container.querySelector('[role="status"]')).toBeTruthy()
  })

  it('dismisses a toast from its close button', async () => {
    const container = await render()
    await act(async () => { toast.success('Saved') })

    const close = container.querySelector('[aria-label="Dismiss notification"]')
    expect(close).toBeTruthy()
    await act(async () => { close.click() })

    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('renders custom toast content with the toast id', async () => {
    const container = await render()

    await act(async () => {
      toast.custom(({ id }) => <span>Undo item {id}</span>, { duration: 5000 })
    })

    expect(container.textContent).toMatch(/Undo item \d+/)
  })
})
