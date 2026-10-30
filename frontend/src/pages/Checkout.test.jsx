// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { mockNavigate, shopState, liveRows, locationState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  locationState: { state: null },
  shopState: {
    cartItems: [],
    cartStatus: 'ready',
    session: null,
    authReady: true,
    clearCart: vi.fn(),
    pushNotification: vi.fn(),
    openLogin: vi.fn(),
  },
  liveRows: { rows: [] },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => locationState,
  Link: ({ to, children, ...rest }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => shopState,
}))

vi.mock('../lib/supabase', () => ({
  default: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: liveRows.rows }),
      }),
    }),
  },
}))

import Checkout from './Checkout.jsx'

let cleanup = () => {}

beforeEach(() => {
  mockNavigate.mockClear()
  shopState.cartItems = []
  shopState.cartStatus = 'ready'
  shopState.session = null
  shopState.authReady = true
  shopState.pushNotification.mockClear()
  shopState.openLogin.mockClear()
  locationState.state = null
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

const item = (id, name, price, quantity) => ({
  id, name, price, quantity, image: '', collection: 'Dogs', brand: 'Test',
})
const live = (id, price, stock = 50) => ({ prod_id: id, price, stock_quantity: stock, is_active: true })

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const SESSION = { access_token: 'tok' }

describe('Checkout entry (B2/C1)', () => {
  it('shows a sign-in prompt instead of the form when signed out', async () => {
    shopState.session = null
    const container = await render(<Checkout />)
    expect(document.body.textContent).toContain('Sign in to check out')
    expect(container.querySelector('form')).toBeNull()
    const signIn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign in')
    await act(async () => { signIn.click() })
    expect(shopState.openLogin).toHaveBeenCalled()
  })

  it('opens the sign-in modal and shows a toast when a guest arrives', async () => {
    shopState.session = null
    await render(<Checkout />)
    // both happen together: the modal explains the block, the toast stays
    // readable behind it
    expect(shopState.openLogin).toHaveBeenCalledTimes(1)
    expect(shopState.pushNotification).toHaveBeenCalledWith(
      expect.stringContaining('Sign in to place your order'),
      'info'
    )
  })

  it('does not prompt a shopper who is already signed in', async () => {
    shopState.session = SESSION
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 1)]
    liveRows.rows = [live(A, 800, 10)]
    locationState.state = { selectedIds: [A] }
    await render(<Checkout />)
    expect(shopState.openLogin).not.toHaveBeenCalled()
  })

  it('waits for the session to resolve before deciding who is a guest', async () => {
    shopState.authReady = false
    shopState.session = null
    const container = await render(<Checkout />)
    // neither the sign-in card nor a modal while we do not know yet
    expect(document.body.textContent).not.toContain('Sign in to check out')
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(shopState.openLogin).not.toHaveBeenCalled()
    expect(shopState.pushNotification).not.toHaveBeenCalled()
  })

  it('redirects to the cart when there is no valid selection', async () => {
    shopState.session = SESSION
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 1)]
    liveRows.rows = [live(A, 800, 10)]
    locationState.state = { selectedIds: ['cccccccc-0000-4000-8000-000000000009'] } // stale id
    await render(<Checkout />)
    expect(mockNavigate).toHaveBeenCalledWith('/cart', { replace: true })
    expect(shopState.pushNotification).toHaveBeenCalled()
  })

  it('renders the form for a valid selection and ignores stale ids', async () => {
    shopState.session = SESSION
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 2)]
    liveRows.rows = [live(A, 800, 10)]
    locationState.state = {
      selectedIds: [A, 'cccccccc-0000-4000-8000-000000000009'],
    }
    const container = await render(<Checkout />)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(container.querySelector('form')).not.toBeNull()
    // summary shows the valid item only
    expect(document.body.textContent).toContain('Alpha Pro 10kg')
    // review row: 1 product (2 items) and the shared shipping fee
    expect(document.body.textContent).toContain('1 product (2 items)')
    expect(document.body.textContent).toContain('PHP 1,675.00') // 1600 + 75
  })

  it('blocks checkout when the selected product became unavailable', async () => {
    shopState.session = SESSION
    shopState.cartItems = [item(A, 'Alpha Pro 10kg', 800, 1)]
    liveRows.rows = [{ ...live(A, 800, 0) }] // out of stock now
    locationState.state = { selectedIds: [A] }
    await render(<Checkout />)
    // no purchasable selection -> bounced back to the cart with a message
    expect(mockNavigate).toHaveBeenCalledWith('/cart', { replace: true })
  })
})
