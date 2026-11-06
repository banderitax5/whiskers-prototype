// @vitest-environment jsdom
// Live content hook: one fetch on mount, then a re-fetch when the shared
// change signal fires, and no work after unmount.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('./siteContent.js', () => ({
  fetchSiteContent: (...args) => fetchSiteContent(...args),
}))

const fetchSiteContent = vi.fn()

let live
let root = null
let container = null

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Probe({ force = false }) {
  const { content, loaded } = live.useSiteContent({ force })
  return (
    <div>
      <span data-testid="loaded">{String(loaded)}</span>
      <span data-testid="title">{content?.settings?.store_name || ''}</span>
    </div>
  )
}

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(ui) })
  return container
}

const title = () => container.querySelector('[data-testid="title"]')?.textContent

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  fetchSiteContent.mockReset()
  live = await import('./siteContentLive.js')
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  live?.resetSiteContentLiveForTests()
  vi.useRealTimers()
  document.body.innerHTML = ''
  root = null
  container = null
})

describe('siteContentLive', () => {
  it('loads content once on mount', async () => {
    fetchSiteContent.mockResolvedValue({ seeded: true, content_version: 1, settings: { store_name: 'Whiskers' } })
    await render(<Probe />)

    expect(container.querySelector('[data-testid="loaded"]').textContent).toBe('true')
    expect(title()).toBe('Whiskers')
    expect(fetchSiteContent).toHaveBeenCalledTimes(1)
    expect(fetchSiteContent).toHaveBeenCalledWith(false)
  })

  it('re-fetches with the new version and updates the UI when content changes', async () => {
    fetchSiteContent
      .mockResolvedValueOnce({ seeded: true, content_version: 1, settings: { store_name: 'Old name' } })
      .mockResolvedValueOnce({ seeded: true, content_version: 2, settings: { store_name: 'New name' } })

    await render(<Probe />)
    expect(title()).toBe('Old name')

    await act(async () => {
      live.notifySiteContentChanged(2)
      vi.advanceTimersByTime(300)
    })

    expect(title()).toBe('New name')
    expect(fetchSiteContent).toHaveBeenLastCalledWith(true, 2)
  })

  it('collapses a burst of changes into one re-fetch', async () => {
    fetchSiteContent
      .mockResolvedValueOnce({ seeded: true, content_version: 1, settings: { store_name: 'A' } })
      .mockResolvedValue({ seeded: true, content_version: 2, settings: { store_name: 'B' } })

    await render(<Probe />)
    expect(fetchSiteContent).toHaveBeenCalledTimes(1)

    await act(async () => {
      live.notifySiteContentChanged(2)
      live.notifySiteContentChanged(3)
      live.notifySiteContentChanged(4)
      vi.advanceTimersByTime(300)
    })

    expect(fetchSiteContent).toHaveBeenCalledTimes(2)
    expect(fetchSiteContent).toHaveBeenLastCalledWith(true, 4)
  })

  it('stops listening after unmount', async () => {
    fetchSiteContent.mockResolvedValue({ seeded: true, content_version: 1, settings: { store_name: 'X' } })
    await render(<Probe />)
    expect(fetchSiteContent).toHaveBeenCalledTimes(1)

    await act(async () => { root.unmount() })
    root = null

    await act(async () => {
      live.notifySiteContentChanged(2)
      vi.advanceTimersByTime(300)
    })

    expect(fetchSiteContent).toHaveBeenCalledTimes(1)
  })

  it('honours force=true for pages that remount on navigation', async () => {
    fetchSiteContent.mockResolvedValue({ seeded: true, content_version: 1, settings: { store_name: 'X' } })
    await render(<Probe force />)
    expect(fetchSiteContent).toHaveBeenCalledTimes(1)
    expect(fetchSiteContent).toHaveBeenCalledWith(true)
  })
})
