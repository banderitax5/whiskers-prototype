// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test' } } }),
      getUser: async () => ({ data: { user: { id: 'self-id' } } }),
    },
  },
}))
vi.mock('../lib/api', () => ({
  apiGet: vi.fn(),
  apiGetAuth: vi.fn(),
  apiGetAllPages: vi.fn(),
  apiPostAuth: vi.fn(),
  apiPatchAuth: vi.fn(),
  apiDeleteAuth: vi.fn(),
}))
const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('react-hot-toast', () => ({
  default: toastMock,
}))

import AdminCustomers from './AdminCustomers.jsx'
import { apiGetAllPages, apiPatchAuth } from '../lib/api'
import toast from 'react-hot-toast'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const sample = {
  id: 'c1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  phone: '09171234567',
  role: 'user',
  ordersCount: 2,
  totalSpent: 530,
  feedback: null,
}

async function render() {
  apiGetAllPages.mockResolvedValue({ items: [sample], total: 1 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<AdminCustomers />) })
  cleanup = () => act(() => root.unmount())
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return container
}

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

// the role control is an AdminRowDropdown whose menu portals to document.body
async function pickRole(value) {
  const trigger = document.querySelector('[aria-haspopup="listbox"]')
  if (!trigger) throw new Error('no role dropdown trigger')
  await act(async () => { trigger.click() })
  await flush()
  const opt = [...document.querySelectorAll('[role="option"]')]
    .find((o) => o.getAttribute('data-value') === value)
  if (!opt) throw new Error(`no option ${value}`)
  await act(async () => { opt.click() })
  await flush()
}

describe('AdminCustomers role assignment', () => {
  it('patches the role and updates the pill after picking from the dropdown', async () => {
    apiPatchAuth.mockResolvedValue({ item: { id: 'c1', role: 'staff' } })
    const c = await render()
    expect(c.textContent).toMatch(/user/)

    await pickRole('staff')

    expect(apiPatchAuth).toHaveBeenCalledWith('/admin/customers/c1/role', { role: 'staff' }, 'test')
    expect(toast.success).toHaveBeenCalledWith('Role changed to staff')
    // pill + trigger both show the new role
    expect(document.body.textContent).toMatch(/staff/)
    expect(c.textContent).not.toMatch(/user/)
  })

  it('keeps the old role and toasts the error when the patch fails', async () => {
    apiPatchAuth.mockRejectedValue(new Error('Additional verification required.'))
    const c = await render()

    await pickRole('admin')

    expect(apiPatchAuth).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Additional verification required.')
    expect(c.textContent).toMatch(/user/)
    expect(document.body.textContent).not.toMatch(/admin/)
  })

  it('tells the admin when they cancel the password prompt', async () => {
    apiPatchAuth.mockRejectedValue(new Error('Verification cancelled'))
    const c = await render()

    await pickRole('staff')

    // not silent: a visible note explains why the row did not change
    expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('Role was not changed'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(c.textContent).toMatch(/user/)
  })
})
