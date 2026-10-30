// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { GUEST_CART_KEY, readGuestCart } from '../lib/guestCart.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { auth, toast } = vi.hoisted(() => ({
  auth: { listener: null, session: null },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}))

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.session } }),
      onAuthStateChange: (cb) => {
        auth.listener = cb
        return { data: { subscription: { unsubscribe: () => { auth.listener = null } } } }
      },
    },
  },
}))

vi.mock('../lib/toast.js', () => ({ default: toast }))

import { ShopProvider, useShop } from './ShopContext.jsx'

let ctx = null
let cleanup = () => {}

function Probe() {
  ctx = useShop()
  return <div data-count={ctx.cartCount} />
}

async function renderShop() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<ShopProvider><Probe /></ShopProvider>) })
  // flush the getSession promise + the guest-cart load effect
  await act(async () => {})
  cleanup = () => act(() => root.unmount())
  return container
}

const PRODUCT = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Alpha Pro 10kg',
  price: 800,
  image: '/img/a.png',
  collection: 'Dogs',
  brand: 'Royal Canin',
}
const PRODUCT_B = { ...PRODUCT, id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Beta 2kg', price: 250 }

function seedGuestCart(lines) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines))
}

beforeEach(() => {
  localStorage.clear()
  auth.session = null
  auth.listener = null
  Object.values(toast).forEach((fn) => fn.mockClear())
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }))
})

afterEach(() => {
  cleanup()
  cleanup = () => {}
  ctx = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('guest cart', () => {
  it('lets a signed-out visitor add an item without a sign-in prompt', async () => {
    await renderShop()
    const openLogin = vi.fn()
    act(() => ctx.setOpenLoginFn(openLogin))

    await act(async () => { await ctx.addToCart(PRODUCT) })

    expect(ctx.cartCount).toBe(1)
    expect(openLogin).not.toHaveBeenCalled()
    expect(readGuestCart()).toEqual([expect.objectContaining({ id: PRODUCT.id, quantity: 1 })])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('merges repeat adds into one line and keeps it in storage', async () => {
    await renderShop()
    await act(async () => { await ctx.addToCart(PRODUCT) })
    await act(async () => { await ctx.addToCart(PRODUCT, 2) })

    expect(ctx.cartItems).toHaveLength(1)
    expect(ctx.cartItems[0].quantity).toBe(3)
    expect(readGuestCart()[0].quantity).toBe(3)
  })

  it('restores a stored guest cart on load', async () => {
    seedGuestCart([{ ...PRODUCT, quantity: 2 }, { ...PRODUCT_B, quantity: 1 }])
    await renderShop()

    expect(ctx.cartCount).toBe(3)
    expect(ctx.cartStatus).toBe('ready')
  })

  it('keeps the guest cart when Supabase announces a null initial session', async () => {
    // Supabase fires INITIAL_SESSION with a null session for signed-out
    // visitors. Clearing the cart on that event wiped the stored guest cart on
    // every page load, which is exactly how this bug shipped the first time.
    seedGuestCart([{ ...PRODUCT, quantity: 1 }])
    await renderShop()
    expect(ctx.cartCount).toBe(1)

    await act(async () => { auth.listener('INITIAL_SESSION', null) })
    await act(async () => {})

    expect(ctx.cartCount).toBe(1)
    expect(readGuestCart()).toHaveLength(1)
  })

  it('persists quantity edits and removals for a guest', async () => {
    seedGuestCart([{ ...PRODUCT, quantity: 1 }])
    await renderShop()

    await act(async () => { await ctx.updateQuantity(PRODUCT.id, 4) })
    expect(readGuestCart()[0].quantity).toBe(4)

    await act(async () => { ctx.removeFromCart(PRODUCT.id) })
    expect(ctx.cartItems).toHaveLength(0)
    expect(readGuestCart()).toEqual([])
  })
})

describe('merging a guest cart on sign-in', () => {
  it('posts every guest line, then shows the merged server cart', async () => {
    seedGuestCart([{ ...PRODUCT, quantity: 2 }, { ...PRODUCT_B, quantity: 1 }])
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') return { ok: true, status: 200, json: async () => ({}) }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { product_id: PRODUCT.id, name: PRODUCT.name, price: 800, quantity: 3, image: '', collection: '', brand: '' },
          ],
        }),
      }
    })
    await renderShop()

    auth.session = { access_token: 'tok' }
    await act(async () => {
      auth.listener('SIGNED_IN', auth.session)
    })
    await act(async () => {})

    const posts = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(JSON.parse(posts[0][1].body)).toEqual({ productId: PRODUCT.id, quantity: 2 })
    expect(JSON.parse(posts[1][1].body)).toEqual({ productId: PRODUCT_B.id, quantity: 1 })
    expect(globalThis.fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer tok')

    // storage is emptied and the cart now reflects the account
    expect(readGuestCart()).toEqual([])
    expect(ctx.cartCount).toBe(3)
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('2 items'))
  })

  it('drops a line the server rejects and says so', async () => {
    seedGuestCart([{ ...PRODUCT, quantity: 1 }])
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') return { ok: false, status: 404, json: async () => ({ error: 'gone' }) }
      return { ok: true, status: 200, json: async () => ({ items: [] }) }
    })
    await renderShop()

    auth.session = { access_token: 'tok' }
    await act(async () => { auth.listener('SIGNED_IN', auth.session) })
    await act(async () => {})

    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('no longer available'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(ctx.cartCount).toBe(0)
  })

  it('does not merge twice when two auth events fire together', async () => {
    seedGuestCart([{ ...PRODUCT, quantity: 1 }])
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }))
    await renderShop()

    auth.session = { access_token: 'tok' }
    await act(async () => {
      auth.listener('SIGNED_IN', auth.session)
      auth.listener('TOKEN_REFRESHED', auth.session)
    })
    await act(async () => {})

    const posts = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
    expect(posts).toHaveLength(1)
  })

  it('never writes the account cart into guest storage on sign-out', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ product_id: PRODUCT.id, name: PRODUCT.name, price: 800, quantity: 2, image: '', collection: '', brand: '' }],
      }),
    }))
    await renderShop()

    auth.session = { access_token: 'tok' }
    await act(async () => { auth.listener('SIGNED_IN', auth.session) })
    await act(async () => {})
    expect(ctx.cartCount).toBe(2)

    await act(async () => { auth.listener('SIGNED_OUT', null) })
    await act(async () => {})

    expect(ctx.cartCount).toBe(0)
    expect(localStorage.getItem(GUEST_CART_KEY)).toBeNull()
  })
})
