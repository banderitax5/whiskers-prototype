// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { mockNavigate, shopState, liveRows } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  shopState: {
    cartItems: [],
    cartStatus: 'ready',
    lastAddedAt: 0,
    reloadCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  },
  liveRows: { rows: [] },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...rest }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => shopState,
}))

// the live product check resolves through the Supabase client; hand it rows
// from the test fixture so availability is deterministic
vi.mock('../lib/supabase', () => ({
  default: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: liveRows.rows }),
      }),
    }),
  },
}))

// the recommendation strip fetches the catalog; keep it out of these tests
vi.mock('../components/CartRecommendations.jsx', () => ({
  default: () => null,
}))

import Cart from './Cart.jsx'

let cleanup = () => {}

beforeEach(() => {
  mockNavigate.mockClear()
  shopState.cartItems = []
  shopState.cartStatus = 'ready'
  shopState.lastAddedAt = 0
  liveRows.rows = []
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  cleanup = () => act(() => root.unmount())
  return container
}

// re-render with whatever the test put into shopState / liveRows
async function rerender(root) {
  await act(async () => { root.render(<Cart />) })
}

async function mountCart() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<Cart />) })
  cleanup = () => act(() => root.unmount())
  return { container, root }
}

const item = (id, name, price, quantity) => ({
  id, name, price, quantity, image: '', collection: 'Dogs', brand: 'Test',
})

const live = (id, price, stock = 50) => ({
  prod_id: id, price, stock_quantity: stock, is_active: true,
})

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'

function findCheckoutButtons(container) {
  return [...container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Checkout')
}

function selectedItemsValue(container) {
  const label = [...container.querySelectorAll('span')].find((s) => s.textContent === 'Selected items')
  return label ? label.parentElement.querySelector('span:last-child').textContent : null
}

describe('Cart selection (B1)', () => {
  it('drops a removed item from the selection, totals, and checkout payload', async () => {
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 2), item(B, 'Gastro 2kg', 1680, 1)]
    liveRows.rows = [live(A, 800, 10), live(B, 1680, 50)]

    const { root } = await mountCart()

    // both rows available -> auto-selected (U1)
    expect(selectedItemsValue(document)).toBe('2')
    const checkboxes = [...document.querySelectorAll('article input[type="checkbox"]')]
    expect(checkboxes.every((c) => c.checked)).toBe(true)

    // user removes A; context drops the row from cartItems
    shopState.cartItems = [item(B, 'Gastro 2kg', 1680, 1)]
    liveRows.rows = [live(B, 1680, 50)]
    await rerender(root)

    // stale id must not survive: 1 selected product, B's subtotal, enabled checkout
    expect(selectedItemsValue(document)).toBe('1')
    expect(document.body.textContent).not.toContain('Alpha Pro 10kg')
    const subtotal = [...document.querySelectorAll('span')].find((s) => s.textContent === 'Subtotal')
      .parentElement.querySelector('span:last-child').textContent
    expect(subtotal).toBe('PHP 1,680.00')

    const checkout = findCheckoutButtons(document)[0]
    expect(checkout.disabled).toBe(false)
    await act(async () => { checkout.click() })

    expect(mockNavigate).toHaveBeenCalledWith('/checkout', {
      state: { selectedIds: [B] },
    })
  })

  it('disables checkout and explains why when nothing is selected', async () => {
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 1)]
    liveRows.rows = [live(A, 800, 10)]

    const container = await render(<Cart />)

    // deselect everything via Clear selection
    const clear = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Clear selection')
    await act(async () => { clear.click() })

    const checkout = findCheckoutButtons(container)[0]
    expect(checkout.disabled).toBe(true)
    expect(checkout.getAttribute('aria-describedby')).toBe('checkout-reason')
    expect(document.getElementById('checkout-reason').textContent).toContain('Select at least one available item')
    expect(document.body.textContent).toContain('Select items to check out')
  })

  it('shows a skeleton while loading and never the empty state', async () => {
    shopState.cartStatus = 'loading'
    shopState.cartItems = []
    const container = await render(<Cart />)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain('Your cart is empty')
  })

  it('shows an error state with retry instead of "empty"', async () => {
    shopState.cartStatus = 'error'
    shopState.cartItems = []
    const container = await render(<Cart />)
    expect(document.body.textContent).toContain('Could not load your cart')
    expect(document.body.textContent).not.toContain('Your cart is empty')
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Retry')
    await act(async () => { retry.click() })
    expect(shopState.reloadCart).toHaveBeenCalled()
  })

  it('marks unavailable items and keeps them out of the selection', async () => {
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 1), item(B, 'Cardiac Can', 265, 2)]
    liveRows.rows = [live(A, 800, 10), { ...live(B, 265, 0) }]

    const container = await render(<Cart />)

    expect(selectedItemsValue(container)).toBe('1')
    expect(document.body.textContent).toContain('Out of stock')
    const boxes = [...container.querySelectorAll('article input[type="checkbox"]')]
    expect(boxes[0].checked).toBe(true)
    expect(boxes[1].disabled).toBe(true)
    // total only includes the available row (800 + 75 shipping)
    const total = [...container.querySelectorAll('span')].find((s) => s.textContent === 'Total')
      .parentElement.querySelector('span:last-child').textContent
    expect(total).toBe('PHP 875.00')
  })
})
