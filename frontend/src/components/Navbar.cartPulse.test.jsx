// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// The mobile menu is the only cart indicator a phone shopper ever sees (the
// desktop cart button is `hidden sm:flex`), so it has to carry the same count
// pill and the same "just added" pulse. These tests pin that down.
const { shopState } = vi.hoisted(() => ({
  shopState: { cartCount: 0, lastAddedAt: null, setOpenLoginFn: vi.fn() },
}))

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  NavLink: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => shopState,
}))

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}))

// Child widgets fetch their own data; the cart indicator does not need them.
vi.mock('./SearchSuggestions', () => ({ default: () => null }))
vi.mock('./MobileSearch', () => ({ default: () => null }))
vi.mock('./LoginModal', () => ({ default: () => null }))
vi.mock('./SignupModal', () => ({ default: () => null }))

import Navbar from './Navbar.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let cleanup = () => {}
let root = null

beforeEach(() => {
  shopState.cartCount = 0
  shopState.lastAddedAt = null
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<Navbar />) })
  cleanup = () => act(() => root.unmount())
  return container
}

// Re-rendering the same element type keeps component state, which is how a
// real context update looks to Navbar.
async function rerender() {
  await act(async () => { root.render(<Navbar />) })
}

const menuButton = () => [...document.querySelectorAll('button')].find((b) => /^Menu/.test(b.getAttribute('aria-label') || ''))
const cartLinks = () => [...document.querySelectorAll('a[href="/cart"]')]
const pings = () => [...document.querySelectorAll('.animate-ping')]

async function openMenu() {
  await act(async () => { menuButton().click() })
}

describe('Navbar cart indicator', () => {
  it('shows the count on the desktop cart and inside the mobile menu', async () => {
    shopState.cartCount = 3
    await render()
    // only the desktop cart link exists while the menu is closed
    expect(cartLinks()).toHaveLength(1)
    expect(cartLinks()[0].textContent).toContain('3')

    await openMenu()
    const links = cartLinks()
    expect(links).toHaveLength(2)
    const mobile = links[1]
    // plain-text count in the menu (the desktop pill covers the small icon)
    expect(mobile.textContent).toContain('Cart')
    expect(mobile.textContent).toContain('(3)')
    expect(mobile.querySelector('.bg-yellow-400')).toBeNull()
    // the accessible name still spells the count out for screen readers
    expect(mobile.getAttribute('aria-label')).toBe('Cart, 3 items')
  })

  it('shows the count on the burger itself, without opening the menu', async () => {
    shopState.cartCount = 2
    await render()
    // the menu is closed - a phone shopper must still see that the cart has
    // something in it, otherwise the indicator is invisible until they open it
    expect(cartLinks()).toHaveLength(1)
    const badge = menuButton().querySelector('.bg-yellow-400')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('2')
    expect(menuButton().getAttribute('aria-label')).toBe('Menu, 2 items in cart')
  })

  it('pulses the burger when an item is added, then stops', async () => {
    vi.useFakeTimers()
    await render()
    expect(menuButton().querySelector('.animate-ping')).toBeNull()

    shopState.cartCount = 1
    shopState.lastAddedAt = Date.now()
    await rerender()
    expect(menuButton().querySelector('.animate-ping')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(1400) })
    expect(menuButton().querySelector('.animate-ping')).toBeNull()
  })

  it('caps the count at 99+', async () => {
    shopState.cartCount = 150
    await render()
    expect(cartLinks()[0].querySelector('.bg-yellow-400').textContent).toBe('99+')
    expect(menuButton().querySelector('.bg-yellow-400').textContent).toBe('99+')
    await openMenu()
    expect(cartLinks()[1].textContent).toContain('(99+)')
  })

  it('spells the accessible name with a singular item', async () => {
    shopState.cartCount = 1
    await render()
    await openMenu()
    expect(cartLinks()[1].getAttribute('aria-label')).toBe('Cart, 1 item')
  })

  it('renders no badge for an empty cart', async () => {
    await render()
    // the burger must not claim there is anything to check
    expect(menuButton().querySelector('.bg-yellow-400')).toBeNull()
    expect(menuButton().querySelector('.animate-ping')).toBeNull()
    expect(menuButton().getAttribute('aria-label')).toBe('Menu')

    await openMenu()
    for (const link of cartLinks()) {
      expect(link.querySelector('.bg-yellow-400')).toBeNull()
      expect(link.querySelector('.animate-ping')).toBeNull()
    }
    expect(cartLinks()[1].textContent).not.toContain('(0)')
  })

  it('pulses the cart when an item is added, then stops', async () => {
    vi.useFakeTimers()
    await render()
    expect(pings()).toHaveLength(0)

    shopState.cartCount = 1
    shopState.lastAddedAt = Date.now()
    await rerender()
    expect(pings().length).toBeGreaterThan(0)

    await act(async () => { vi.advanceTimersByTime(1400) })
    expect(pings()).toHaveLength(0)
  })

  it('replays the pulse in the mobile menu when the item was added while it was closed', async () => {
    vi.useFakeTimers()
    await render()

    // added from a product card: the menu is closed, so a 1.3s flash would be
    // over long before the shopper taps the burger
    shopState.cartCount = 2
    shopState.lastAddedAt = Date.now()
    await rerender()
    await act(async () => { vi.advanceTimersByTime(1400) })
    expect(pings()).toHaveLength(0)

    // opening the menu must still announce it
    await openMenu()
    expect(pings().length).toBeGreaterThan(0)

    await act(async () => { vi.advanceTimersByTime(1400) })
    expect(pings()).toHaveLength(0)
  })
})
