/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import supabase from '../lib/supabase'
import { trackEvent } from '../lib/appEvents.js'

// global shop context that handles the cart for the whole app
// talks to the backend API to persist cart items in the database
// every component that needs cart data or actions uses the useShop() hook
const ShopContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// fetches a fresh session from Supabase, which handles token refresh
// and signature validation internally. Returns the access token or null
// if the session is invalid / expired and cannot be refreshed.
async function getValidToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// takes a row from the cart_items database table and reshapes it
// into the format the frontend components expect
function normalizeDbItem(row) {
  return {
    id: row.product_id,
    name: row.name,
    price: Number(row.price) || 0,
    image: row.image || '',
    collection: row.collection || '',
    brand: row.brand || '',
    quantity: row.quantity,
  }
}

export function ShopProvider({ children }) {
  const [cartItems, setCartItems] = useState([])
  const [session, setSession] = useState(null)
  const [lastAddedAt, setLastAddedAt] = useState(0)

  // tracks whether we already loaded the cart for the current session
  const cartLoadedRef = useRef(false)

  // this ref holds a function that opens the login modal
  const openLoginRef = useRef(null)

  // fetches the cart from the backend and updates local state
  const loadCart = useCallback(async (token) => {
    const t = token || await getValidToken()
    if (!t) return false
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) return false
      const { items } = await res.json()
      setCartItems((items || []).map(normalizeDbItem))
      return true
    } catch {
      return false
    }
  }, [])

  // listen for auth changes so we always know if the user is logged in
  // the cart is loaded once per session, the flag is only set after a successful
  // fetch so that if the first event carries a revoked token (401) the next event
  // with a refreshed token will retry instead of being skipped
  // on SIGNED_IN the flag resets so a fresh login always fetches the cart
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (!s) {
        cartLoadedRef.current = false
        setCartItems([])
        return
      }
      if (event === 'SIGNED_IN') {
        cartLoadedRef.current = false
      }
      if (!cartLoadedRef.current) {
        loadCart(s.access_token).then((ok) => {
          if (ok) cartLoadedRef.current = true
        })
      }
    })
    return () => subscription.unsubscribe()
  }, [loadCart])

  // called by the Navbar to hand us a function that opens the login modal
  // this way ShopContext can trigger the login popup without importing Navbar
  function setOpenLoginFn(fn) {
    openLoginRef.current = fn
  }

  // opens the login modal from anywhere that has access to the shop context
  function openLogin() {
    if (openLoginRef.current) openLoginRef.current()
  }

  // shows a toast notification on screen
  // type can be 'success', 'error', or 'info'
  function pushNotification(message, type = 'success') {
    if (type === 'error') toast.error(message)
    else if (type === 'info') toast(message, { icon: 'ℹ️' })
    else toast.success(message)
  }

  // adds a product to the cart
  // if the user is not logged in, it opens the login modal and bails out
  // uses optimistic updates so the UI feels instant, then syncs with the backend
  const addToCart = useCallback(async (product, quantity = 1, opts = { notify: true }) => {
    const token = await getValidToken()
    if (!token) {
      if (openLoginRef.current) openLoginRef.current()
      pushNotification('Please sign in to add items to cart', 'info')
      return
    }

    const qty = Math.max(1, Number(quantity) || 1)

    // update the local cart right away so the user sees it instantly
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + qty } : item
        )
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        image: product.image || '',
        collection: product.collection || '',
        brand: product.brand || '',
        quantity: qty,
      }]
    })
    setLastAddedAt(Date.now())
    if (opts.notify) pushNotification(`${product.name} added to cart`, 'success')
    trackEvent('add_to_cart', { product_id: product.id, name: product.name, price: product.price })

    // fire the POST to the backend so the database stays in sync
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          collection: product.collection,
          brand: product.brand,
          quantity: qty,
        }),
      })
      if (!res.ok) {
        // backend rejected the add — resync local state with DB
        await loadCart(token)
      }
    } catch {
      // network error — resync to undo the optimistic update
      await loadCart(token)
    }
  }, [loadCart])

  // changes the quantity for a specific product in the cart
  // updates locally first, then tells the backend
  const updateQuantity = useCallback(async (productId, quantity) => {
    const qty = Math.max(1, Number(quantity) || 1)
    setCartItems((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, quantity: qty } : item))
    )
    const token = await getValidToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/cart/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity: qty }),
      })
      if (!res.ok) await loadCart(token)
    } catch {
      await loadCart(token)
    }
  }, [loadCart])

  // removes a single product from the cart by its id
  // shows a toast so the user knows it was removed
  const removeFromCart = useCallback(async (productId) => {
    const removed = cartItems.find((item) => item.id === productId)
    setCartItems((prev) => prev.filter((item) => item.id !== productId))
    if (removed) pushNotification(`${removed.name} removed from cart`, 'info')
    const token = await getValidToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: [productId] }),
      })
      if (!res.ok) await loadCart(token)
    } catch {
      await loadCart(token)
    }
  }, [cartItems, loadCart])

  // removes multiple items at once, or clears the whole cart if no ids are passed
  // the Cart page uses this for the "Remove Selected" button
  const clearCart = useCallback(async (ids = null) => {
    if (!ids) {
      setCartItems([])
    } else {
      const setIds = new Set(ids)
      setCartItems((prev) => prev.filter((item) => !setIds.has(item.id)))
    }
    const token = await getValidToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: ids ? JSON.stringify({ productIds: ids }) : JSON.stringify({}),
      })
      if (!res.ok) await loadCart(token)
    } catch {
      await loadCart(token)
    }
  }, [loadCart])

  // total number of individual items in the cart (accounts for quantity)
  // this is what shows up on the cart badge in the navbar
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  )

  // everything we expose to the rest of the app through useShop()
  const value = {
    cartItems,
    cartCount,
    session,
    lastAddedAt,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    pushNotification,
    setOpenLoginFn,
    openLogin,
  }

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

// hook that any component can call to access cart data and actions
// must be used inside a ShopProvider or it will throw an error
export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used inside ShopProvider')
  return ctx
}
