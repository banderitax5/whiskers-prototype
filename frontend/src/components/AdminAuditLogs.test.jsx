// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession: async () => ({ data: { session: { access_token: 'test', user: { email: 'admin@example.com' } } } }) } },
}))
vi.mock('../lib/api', () => ({
  apiGetAuth: vi.fn(),
  apiGetAllPages: vi.fn(),
  apiGet: vi.fn(),
}))

import AdminAuditLogs from './AdminAuditLogs.jsx'
import { apiGetAuth, apiGetAllPages, apiGet } from '../lib/api'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<AdminAuditLogs />) })
  cleanup = () => act(() => root.unmount())
  return container
}
async function flush() {
  // let the fetch + resolver promises settle through React's scheduler
  for (let i = 0; i < 5; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  }
}

function portalOptions() {
  return [...document.querySelectorAll('[role="option"]')]
}
async function openSelect(id) {
  const trigger = document.querySelector(`#${id}`)
  await act(async () => { trigger.click() })
}
async function clickOption(value) {
  const opt = portalOptions().find((o) => o.getAttribute('data-value') === value)
  if (!opt) throw new Error(`no portal option ${value}`)
  await act(async () => { opt.click() })
}
async function pickSelect(id, value) {
  await openSelect(id)
  await clickOption(value)
}

const NOW_ISO = new Date().toISOString()
const U1 = '11111111-1111-1111-1111-111111111111'
const P1 = '22222222-2222-2222-2222-222222222222'

const SAMPLE = [
  {
    id: 'row-settings',
    admin_email: 'admin@example.com',
    action: 'settings_update',
    target: 'site_settings',
    details: 'updated: store_name, shipping_fee',
    changes: {
      store_name: { from: 'Whiskers Pet Shop', to: 'Happy Paws' },
      shipping_fee: { from: 75, to: 99 },
    },
    created_at: NOW_ISO,
  },
  {
    id: 'row-role',
    admin_email: 'juan@example.com',
    action: 'role_change',
    target: `user:${U1}`,
    details: 'role -> staff (step-up verified)',
    created_at: NOW_ISO,
  },
  {
    id: 'row-stepup',
    admin_email: 'juan@example.com',
    action: 'stepup_failed',
    target: `user:${U1}`,
    details: null,
    created_at: NOW_ISO,
  },
  {
    id: 'row-delete',
    admin_email: 'admin@example.com',
    action: 'delete',
    target: `product:${P1}`,
    details: null,
    created_at: NOW_ISO,
  },
  {
    id: 'row-status',
    admin_email: 'admin@example.com',
    action: 'status',
    target: 'order:order-1',
    details: 'status -> Shipped',
    created_at: NOW_ISO,
  },
]

async function setup() {
  apiGetAuth.mockImplementation(async (path) => {
    if (path.startsWith('/admin/audit-logs')) return { items: SAMPLE }
    throw new Error(`unexpected path ${path}`)
  })
  apiGetAllPages.mockResolvedValue({
    items: [{ id: U1, firstName: 'Juan', lastName: 'Dela Cruz' }],
  })
  apiGet.mockRejectedValue(new Error('404'))
  const container = await render()
  await flush()
  return container
}

async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('Audit logs page', () => {
  it('renders plain-language sentences, hides security rows by default', async () => {
    const container = await setup()
    const text = container.textContent
    expect(text).toContain('You updated the store settings: Store name, Shipping fee.')
    expect(text).toContain('changed the role of "Juan Dela Cruz" to staff')
    expect(text).toContain('You deleted a product that is no longer in the catalog.')
    expect(text).toContain("You changed an order's status to Shipped.")
    // step-up rows are a security category, off until the owner asks for them
    expect(text).not.toContain('wrong password')
    expect(text).toContain('Today')

    const toggles = [...container.querySelectorAll('button[aria-pressed]')]
    const securityToggle = toggles.find((b) => b.textContent.includes('Security checks'))
    await act(async () => { securityToggle.click() })
    expect(container.textContent).toContain('entered a wrong password at a confirmation prompt')
  })

  it('search narrows to matching sentences', async () => {
    const container = await setup()
    const input = container.querySelector('input[aria-label="Search the audit log"]')
    await typeInto(input, 'shipping')
    expect(container.textContent).toContain('Store name, Shipping fee')
    expect(container.textContent).not.toContain('Royal')
    expect(container.textContent).not.toContain('status to Shipped')

    await typeInto(input, 'zzz-no-match')
    expect(container.textContent).toContain('No actions match these filters')
    expect(container.textContent).toContain('Clear filters')
  })

  it('important-only filter keeps risky changes', async () => {
    const container = await setup()
    const toggles = [...container.querySelectorAll('button[aria-pressed]')]
    const importantToggle = toggles.find((b) => b.textContent.includes('Important only'))
    await act(async () => { importantToggle.click() })
    const text = container.textContent
    expect(text).toContain('Shipping fee') // settings with shipping fee
    expect(text).toContain('role of "Juan Dela Cruz"') // role change
    expect(text).toContain('no longer in the catalog') // delete
    expect(text).not.toContain('status to Shipped') // ordinary status change dropped
  })

  it('expands a row to show what changed and technical details', async () => {
    const container = await setup()
    const expandBtn = [...container.querySelectorAll('button[aria-controls="audit-d-row-settings"]')][0]
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { expandBtn.click() })
    const panel = container.querySelector('#audit-d-row-settings')
    expect(panel.textContent).toContain('What changed')
    expect(panel.textContent).toContain('Store name')
    expect(panel.textContent).toContain('Shipping fee')
    // structured changes render exact formatted values (Phase B)
    expect(panel.textContent).toContain('₱75.00')
    expect(panel.textContent).toContain('₱99.00')
    expect(panel.textContent).toContain('Happy Paws')
    expect(panel.textContent).toContain('Technical details')
    expect(panel.textContent).toContain('settings_update')
    expect(panel.textContent).toContain('shipping_fee') // raw changes JSON in the tech dl
    expect(expandBtn.getAttribute('aria-expanded')).toBe('true')
    // collapse removes the panel row from the DOM
    await act(async () => { expandBtn.click() })
    expect(container.querySelector('#audit-d-row-settings')).toBeNull()
  })

  it('person filter shows only that person', async () => {
    const container = await setup()
    await pickSelect('audit-person', 'juan@example.com')
    const text = container.textContent
    expect(text).toContain('Juan Dela Cruz')
    expect(text).not.toContain('Store name, Shipping fee')
  })

  it('exports the filtered set as CSV', async () => {
    const createObjectURL = vi.fn(() => 'blob:audit')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      await setup()
      const exportBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Export CSV'))
      await act(async () => { exportBtn.click() })
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
    } finally {
      clickSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
