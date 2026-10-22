// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { shopState, petsState, apiState } = vi.hoisted(() => ({
  shopState: {
    cartItems: [],
    addToCart: vi.fn(),
  },
  petsState: {
    getActivePet: vi.fn(() => null),
    isAuthenticated: false,
  },
  apiState: { result: null, reject: false, calls: 0 },
}))

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../context/ShopContext.jsx', () => ({
  useShop: () => shopState,
}))

vi.mock('../context/PetsContext.jsx', () => ({
  usePets: () => petsState,
}))

vi.mock('../lib/api', () => ({
  apiGet: () => {
    apiState.calls += 1
    return apiState.reject ? Promise.reject(new Error('offline')) : Promise.resolve(apiState.result)
  },
}))

import CartRecommendations from './CartRecommendations.jsx'
import { resetCatalogCache } from '../lib/catalogCache'

let cleanup = () => {}

beforeEach(() => {
  resetCatalogCache()
  shopState.cartItems = []
  shopState.addToCart.mockClear()
  petsState.getActivePet.mockImplementation(() => null)
  petsState.isAuthenticated = false
  apiState.reject = false
  apiState.result = { items: [] }
  apiState.calls = 0
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

const row = (prod_id, prod_name, extra = {}) => ({
  prod_id,
  prod_name,
  price: 150,
  stock_quantity: 20,
  is_active: true,
  category: 'dogs - dry',
  brand: 'Aozi',
  image_url: '',
  ...extra,
})

const CART_ID = 'aaaaaaaa-0000-4000-8000-000000000001'

describe('CartRecommendations', () => {
  it('renders purchasable items that are not already in the cart', async () => {
    apiState.result = {
      items: [
        row(CART_ID, 'Already In Cart'),
        row('bbbbbbbb-0000-4000-8000-000000000002', 'Fresh Pick'),
        row('cccccccc-0000-4000-8000-000000000003', 'Priced Out', { price: 0 }),
      ],
    }
    shopState.cartItems = [{ id: CART_ID, name: 'Already In Cart', price: 150, quantity: 1, collection: 'dogs - dry', brand: 'Aozi' }]
    const container = await render(<CartRecommendations />)
    const text = container.textContent
    expect(text).toContain('You may also like')
    expect(text).toContain('Fresh Pick')
    expect(text).not.toContain('Already In Cart')
    expect(text).not.toContain('Priced Out')
  })

  it('adds a recommendation with quantity 1 and labels the button', async () => {
    const id = 'bbbbbbbb-0000-4000-8000-000000000002'
    apiState.result = { items: [row(id, 'Fresh Pick')] }
    shopState.cartItems = [{ id: CART_ID, name: 'In Cart', price: 150, quantity: 1, collection: 'dogs - dry', brand: 'Aozi' }]
    const container = await render(<CartRecommendations />)
    const button = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Add Fresh Pick to cart')
    expect(button).toBeTruthy()
    await act(async () => { button.click() })
    expect(shopState.addToCart).toHaveBeenCalledTimes(1)
    const [payload, qty] = shopState.addToCart.mock.calls[0]
    expect(payload.id).toBe(id)
    expect(payload.name).toBe('Fresh Pick')
    expect(qty).toBe(1)
  })

  it('renders nothing when the catalog fetch fails', async () => {
    apiState.reject = true
    shopState.cartItems = [{ id: CART_ID, name: 'In Cart', price: 150, quantity: 1, collection: 'dogs - dry', brand: 'Aozi' }]
    const container = await render(<CartRecommendations />)
    expect(container.querySelector('section')).toBeNull()
    expect(document.body.textContent).not.toContain('You may also like')
  })

  it('renders nothing and does not fetch when the cart is empty', async () => {
    apiState.result = { items: [row('x', 'Anything')] }
    const container = await render(<CartRecommendations />)
    expect(container.querySelector('section')).toBeNull()
    expect(apiState.calls).toBe(0)
  })
})
