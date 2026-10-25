// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import RouteErrorBoundary from './RouteErrorBoundary.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function renderRouter(routes) {
  const router = createMemoryRouter(routes)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<RouterProvider router={router} />) })
  cleanup = () => act(() => root.unmount())
  return container
}

function Boom() {
  throw new Error('kaboom')
}

describe('RouteErrorBoundary', () => {
  it('shows a friendly fallback when a route render throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await renderRouter([
      { path: '/', element: <Boom />, errorElement: <RouteErrorBoundary /> },
    ])

    expect(c.textContent).toMatch(/something went wrong/i)
    expect(c.textContent).toMatch(/back to home/i)
  })

  it('shows the status for a route error response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = await renderRouter([
      {
        path: '/',
        element: <div>ok</div>,
        loader: () => { throw new Response(null, { status: 404, statusText: 'Not Found' }) },
        errorElement: <RouteErrorBoundary />,
      },
    ])

    expect(c.textContent).toMatch(/404/)
    expect(c.textContent).toMatch(/page not found/i)
  })
})
