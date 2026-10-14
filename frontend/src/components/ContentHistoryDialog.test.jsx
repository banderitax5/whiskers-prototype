// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}))
vi.mock('../lib/api', () => ({
  apiGetAuth: vi.fn(),
}))

import ContentHistoryDialog from './ContentHistoryDialog.jsx'
import { apiGetAuth } from '../lib/api'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render(entity = 'nav_items') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onClose = vi.fn()
  await act(async () => { root.render(<ContentHistoryDialog entity={entity} onClose={onClose} />) })
  cleanup = () => act(() => root.unmount())
  return { c: container, onClose }
}
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

function button(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

const items = [
  { id: 1, action: 'create', actor: 'owner@example.com', created_at: '2026-10-14T10:00:00Z', snapshot: { label: 'Menu' } },
  { id: 2, action: 'archive', actor: 'owner@example.com', created_at: '2026-10-14T11:00:00Z', snapshot: { label: 'Menu' } },
]

describe('ContentHistoryDialog', () => {
  it('lists entries with action labels and actor, filtered by entity', async () => {
    apiGetAuth.mockResolvedValue({ items, total: 2 })
    const { c } = await render('nav_items')
    await flush()
    expect(c.textContent).toMatch(/Created/)
    expect(c.textContent).toMatch(/Archived/)
    expect(c.textContent).toMatch(/owner@example\.com/)
    expect(apiGetAuth.mock.calls[0][0]).toContain('entity=nav_items')
  })

  it('shows the empty state when nothing is recorded', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const { c } = await render('banners')
    await flush()
    expect(c.textContent).toMatch(/No recorded changes yet/)
  })

  it('shows an error with retry, and retry recovers', async () => {
    apiGetAuth.mockRejectedValueOnce(new Error('boom'))
    apiGetAuth.mockResolvedValueOnce({ items, total: 2 })
    const { c } = await render('sections')
    await flush()
    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/boom/)
    await act(async () => { button(c, 'Retry').click() })
    await flush()
    expect(c.textContent).toMatch(/Created/)
  })

  it('Close calls onClose', async () => {
    apiGetAuth.mockResolvedValue({ items: [], total: 0 })
    const { c, onClose } = await render()
    await flush()
    await act(async () => { button(c, 'Close').click() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
