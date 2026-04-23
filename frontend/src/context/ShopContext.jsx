/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import supabase from '../lib/supabase'

// global shop context that handles the cart for the whole app
// talks to the backend API to persist cart items in the database
// every component that needs cart data or actions uses the useShop() hook
const ShopContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// grabs the latest access token directly from supabase at call time
// avoids stale tokens stuck in react state closures after a background refresh
async function getToken() {
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

  // this ref holds a function that opens the login modal
  // the Navbar registers it on mount so we can trigger the login popup from anywhere
  const openLoginRef = useRef(null)

  // fetches the cart from the backend and updates local state
  // always pulls a fresh token so we never send an expired one
  const loadCart = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const { items } = await res.json()
      setCartItems((items || []).map(normalizeDbItem))
    } catch {
      // network hiccup, just keep whatever we have locally
    }
  }, [])

  // listen for auth changes so we always know if the user is logged in
  // on sign in or token refresh we reload the cart to stay in sync
  // on sign out we clear the cart since it belongs to that user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) loadCart()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (!s) {
        setCartItems([])
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        loadCart()
      }
    })
    return () => subscription.unsubscribe()
  }, [loadCart])

  // called by the Navbar to hand us a function that opens the login modal
  // this way ShopContext can trigger the login popup without importing Navbar
  function setOpenLoginFn(fn) {
    openLoginRef.current = fn
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
    const token = await getToken()
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

    // fire the POST to the backend so the database stays in sync
    try {
      await fetch(`${API_BASE}/cart`, {
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
    } catch {
      // optimistic update already happened so the user still sees the item
      // the backend will catch up on the next page load
    }
  }, [])

  // changes the quantity for a specific product in the cart
  // updates locally first, then tells the backend
  const updateQuantity = useCallback(async (productId, quantity) => {
    const qty = Math.max(1, Number(quantity) || 1)
    setCartItems((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, quantity: qty } : item))
    )
    const token = await getToken()
    if (!token) return
    try {
      await fetch(`${API_BASE}/cart/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity: qty }),
      })
    } catch {
      // silent fail, local state is already updated
    }
  }, [])

  // removes a single product from the cart by its id
  // shows a toast so the user knows it was removed
  const removeFromCart = useCallback(async (productId) => {
    const removed = cartItems.find((item) => item.id === productId)
    setCartItems((prev) => prev.filter((item) => item.id !== productId))
    if (removed) pushNotification(`${removed.name} removed from cart`, 'info')
    const token = await getToken()
    if (!token) return
    try {
      await fetch(`${API_BASE}/cart`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: [productId] }),
      })
    } catch {
      // silent fail
    }
  }, [cartItems])

  // removes multiple items at once, or clears the whole cart if no ids are passed
  // the Cart page uses this for the "Remove Selected" button
  const clearCart = useCallback(async (ids = null) => {
    if (!ids) {
      setCartItems([])
    } else {
      const setIds = new Set(ids)
      setCartItems((prev) => prev.filter((item) => !setIds.has(item.id)))
    }
    const token = await getToken()
    if (!token) return
    try {
      await fetch(`${API_BASE}/cart`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: ids ? JSON.stringify({ productIds: ids }) : JSON.stringify({}),
      })
    } catch {
      // silent fail
    }
  }, [])

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
