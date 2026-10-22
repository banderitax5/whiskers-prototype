// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { mockNavigate, shopState, locationState, orderRow } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  locationState: { state: null },
  shopState: {
    session: { access_token: 'test-token' },
    pushNotification: vi.fn(),
  },
  orderRow: {
    order_id: '3f6b2a91-0f4c-4b8e-9c1d-2a7e5f0b1234',
    status: 'Pending',
    total_amount: 275,
    created_at: '2026-10-16T04:05:06.000Z',
    customer_name: 'Ken',
    phone: '09123456789',
    address: '123 Bayanan Ave, Marikina City',
    items: [{ prod_id: 'p1', quantity: 1, subtotal: 200 }],
    payment: null,
  },
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ orderId: orderRow.order_id }),
  useLocation: () => locationState,
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), () => {}],
  Link: ({ to, children, ...rest }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => shopState,
}))

// display helpers are covered in orderDoc tests; only the receipt-email line
// here depends on them, so stubs keep this test focused
vi.mock('../lib/orderDoc.js', () => ({
  fetchOrderById: async () => orderRow,
  summarize: () => ({ itemsSubtotal: 200, shipping: 75, total: 275, discount: 0 }),
  peso: (n) => `PHP ${Number(n).toFixed(2)}`,
  orderCode: (id) => `#${String(id).slice(0, 8).toUpperCase()}`,
  trackingCode: (id) => `TRK-${id}`,
  formatOrderDateTime: () => 'October 16, 2026, 12:05 PM',
  etaWindow: () => '3-5 days',
  CARRIER: 'J&T Express',
  paymentMethodLabel: () => 'GCash',
  paymentPill: () => ({ label: 'Unpaid', className: 'x' }),
  fulfillmentPill: () => ({ label: 'Pending', className: 'x' }),
  deliveryPill: () => ({ label: 'Not yet shipped', className: 'x' }),
  isOnlinePayment: () => false,
  awaitingGatewayPayment: () => false,
}))

import OrderConfirmation from './OrderConfirmation.jsx'

let cleanup = () => {}

beforeEach(() => {
  locationState.state = null
  shopState.pushNotification.mockClear()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<OrderConfirmation />) })
  cleanup = () => act(() => root.unmount())
  return container
}

describe('OrderConfirmation receipt-email line', () => {
  it('shows the emailed-receipt line when checkout says it was sent', async () => {
    locationState.state = { receiptEmailed: true }
    const c = await render()
    const line = c.querySelector('[role="status"]')
    expect(line?.textContent).toMatch(/payment receipt has been emailed/i)
  })

  it('shows nothing when the flag is absent (refresh or later visit)', async () => {
    locationState.state = null
    const c = await render()
    expect(c.querySelector('[role="status"]')?.textContent || '').not.toMatch(/payment receipt has been emailed/i)
  })
})
