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

  it('renders a diff snapshot as readable Previous -> Current lines, not JSON', async () => {
    apiGetAuth.mockResolvedValue({
      items: [{
        id: 10,
        action: 'update',
        actor: 'owner@example.com',
        created_at: '2026-10-15T10:00:00Z',
        snapshot: {
          name: 'About us',
          changes: {
            href: { from: '/about', to: '/contact' },
            is_visible: { from: true, to: false },
          },
        },
      }],
      total: 1,
    })
    const { c } = await render('nav_items')
    await flush()
    expect(c.textContent).toContain('About us') // entry title in the summary
    expect(c.textContent).toMatch(/Link:\s*\/about\s*→\s*\/contact/)
    expect(c.textContent).toMatch(/Visible:\s*Yes\s*→\s*No/)
    expect(c.textContent).not.toContain('{"') // never a raw JSON dump
  })

  it('humanizes nested diff keys (payment toggles)', async () => {
    apiGetAuth.mockResolvedValue({
      items: [{
        id: 11,
        action: 'update',
        actor: 'owner@example.com',
        created_at: '2026-10-15T10:00:00Z',
        snapshot: {
          name: 'Store settings',
          changes: { 'payment_methods · gcash · enabled': { from: false, to: true } },
        },
      }],
      total: 1,
    })
    const { c } = await render()
    await flush()
    expect(c.textContent).toContain('gcash')
    expect(c.textContent).toMatch(/No\s*→\s*Yes/)
  })

  it('renders reorder snapshots as previous vs new ordered lists of names', async () => {
    apiGetAuth.mockResolvedValue({
      items: [{
        id: 12,
        action: 'reorder',
        actor: 'owner@example.com',
        created_at: '2026-10-15T10:00:00Z',
        snapshot: { name: 'navbar', previous: ['About us', 'Menu'], next: ['Menu', 'About us'] },
      }],
      total: 1,
    })
    const { c } = await render('nav_items')
    await flush()
    expect(c.textContent).toContain('Previous order')
    expect(c.textContent).toContain('New order')
    expect(c.textContent).toContain('About us')
    expect(c.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i) // no raw uuids
  })

  it('renders legacy full-row snapshots as a readable field list', async () => {
    apiGetAuth.mockResolvedValue({
      items: [{
        id: 13,
        action: 'create',
        actor: 'owner@example.com',
        created_at: '2026-10-15T10:00:00Z',
        snapshot: { label: 'Menu', href: '/menu', id: '22222222-3333-4444-5555-666666666666', created_at: 'x' },
      }],
      total: 1,
    })
    const { c } = await render('nav_items')
    await flush()
    expect(c.textContent).toContain('Menu')
    expect(c.textContent).toMatch(/Label:\s*Menu/)
    expect(c.textContent).toMatch(/Link:\s*\/menu/)
    expect(c.textContent).not.toContain('"') // values are text, not quoted JSON
    expect(c.textContent).not.toContain('22222222') // bookkeeping id dropped
  })

  it('renders restore-defaults snapshots as counts, not ids', async () => {
    apiGetAuth.mockResolvedValue({
      items: [{
        id: 14,
        action: 'reset',
        actor: 'owner@example.com',
        created_at: '2026-10-15T10:00:00Z',
        snapshot: { name: 'home_hero', archived: 3, restored: 5, names: ['Slide 1', 'Slide 2'] },
      }],
      total: 1,
    })
    const { c } = await render('banners')
    await flush()
    expect(c.textContent).toContain('Archived 3 previous rows')
    expect(c.textContent).toContain('restored 5 default rows')
    expect(c.textContent).toContain('Slide 1, Slide 2')
  })
})
