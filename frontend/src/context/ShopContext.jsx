/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import toast from '../lib/toast.js'
import supabase from '../lib/supabase'
import { trackEvent } from '../lib/appEvents.js'

// global shop context that handles the cart for the whole app
// talks to the backend API to persist cart items in the database
// every component that needs cart data or actions uses the useShop() hook
const ShopContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// how long the server delete is held back so a toast can offer Undo
const UNDO_WINDOW_MS = 5000

// puts restored cart rows back at the index they were removed from so Undo
// does not shuffle the list; skips ids already present again
function restoreAtIndices(prev, entries) {
  const next = [...prev]
  const ordered = [...entries].sort((a, b) => a.index - b.index)
  for (const { item, index } of ordered) {
    if (next.some((i) => i.id === item.id)) continue
    next.splice(Math.min(index, next.length), 0, item)
  }
  return next
}

// info toast with an Undo button; onUndo fires when Undo is pressed
function showUndoToast(message, onUndo) {
  toast.custom(
    (t) => (
      <div className="flex max-w-sm items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={() => { toast.dismiss(t.id); onUndo() }}
          className="shrink-0 font-semibold text-[#0b2e59] hover:text-[#0046cc] dark:text-blue-400 dark:hover:text-blue-300"
        >
          Undo
        </button>
      </div>
    ),
    { duration: UNDO_WINDOW_MS }
  )
}

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
  const [cartStatus, setCartStatus] = useState('loading') // loading | ready | error
  const [session, setSession] = useState(null)
  const [lastAddedAt, setLastAddedAt] = useState(0)

  // tracks whether we already loaded the cart for the current session
  const cartLoadedRef = useRef(false)

  // this ref holds a function that opens the login modal
  const openLoginRef = useRef(null)

  // latest cart snapshot so delayed deletes can spot re-added items
  const cartItemsRef = useRef(cartItems)
  useEffect(() => { cartItemsRef.current = cartItems }, [cartItems])

  // fetches the cart from the backend and updates local state
  // a failed fetch only surfaces as 'error' when we have nothing to show;
  // during a post-mutation resync stale items stay visible and the caller
  // has already toasted the failure
  const loadCart = useCallback(async (token) => {
    const t = token || await getValidToken()
    if (!t) {
      setCartStatus('ready')
      return false
    }
    // show the skeleton only while we have nothing to render yet
    if (cartItemsRef.current.length === 0) setCartStatus('loading')
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { items } = await res.json()
      setCartItems((items || []).map(normalizeDbItem))
      setCartStatus('ready')
      return true
    } catch {
      setCartStatus((prev) => (cartItemsRef.current.length > 0 ? prev : 'error'))
      return false
    }
  }, [])

  // additive: lets Cart/Checkout re-fetch on demand (retry buttons)
  const reloadCart = useCallback(() => loadCart(), [loadCart])

  // fires a DELETE for specific cart rows, toasts on failure and resyncs
  const deleteCartRows = useCallback(async (productIds, label = 'items') => {
    const token = await getValidToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      toast.error(`Couldn't remove ${label} from your cart. Please try again.`)
      await loadCart(token)
    }
  }, [loadCart])

  // runs after the undo window: delete only rows still absent locally;
  // anything re-added in the meantime is reconciled with a fresh cart load
  const flushPendingDeletes = useCallback(async (productIds, label = 'items') => {
    const stillGone = productIds.filter((id) => !cartItemsRef.current.some((i) => i.id === id))
    const reAdded = stillGone.length !== productIds.length
    if (stillGone.length > 0) await deleteCartRows(stillGone, label)
    if (reAdded) await loadCart()
  }, [deleteCartRows, loadCart])

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
        setCartStatus('ready')
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
    else if (type === 'info') toast.info(message)
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

    // quantities are whole units; decimals are floored, never sent through
    const qty = Math.max(1, Math.floor(Number(quantity) || 1))

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
    // keep the toast handle so a failed sync can dismiss the success message
    const successToastId = opts.notify ? toast.success(`${product.name} added to cart`) : null
    trackEvent('add_to_cart', { product_id: product.id, name: product.name, price: product.price })

    const rollBack = async () => {
      if (successToastId) toast.dismiss(successToastId)
      toast.error(`Couldn't add ${product.name}, please try again.`)
      await loadCart(token)
    }

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
          quantity: qty,
        }),
      })
      if (!res.ok) await rollBack()
    } catch {
      await rollBack()
    }
  }, [loadCart])

  // changes the quantity for a specific product in the cart
  // updates locally first, then tells the backend; rolls back with a toast
  // when the server rejects the change
  const updateQuantity = useCallback(async (productId, quantity) => {
    const qty = Math.max(1, Math.floor(Number(quantity) || 1))
    const name = cartItemsRef.current.find((item) => item.id === productId)?.name || 'item'
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      toast.error(`Couldn't update the quantity of ${name}. Please try again.`)
      await loadCart(token)
    }
  }, [loadCart])

  // removes a single product from the cart by its id
  // the server delete is held back for a few seconds so the toast can offer
  // Undo, which restores the row at its original position
  const removeFromCart = useCallback(async (productId) => {
    const index = cartItems.findIndex((item) => item.id === productId)
    const removed = index >= 0 ? cartItems[index] : null
    if (!removed) return
    setCartItems((prev) => prev.filter((item) => item.id !== productId))

    const timer = setTimeout(() => { flushPendingDeletes([productId], removed.name) }, UNDO_WINDOW_MS)
    showUndoToast(`${removed.name} removed from cart`, () => {
      clearTimeout(timer)
      setCartItems((prev) => restoreAtIndices(prev, [{ item: removed, index }]))
    })
  }, [cartItems, flushPendingDeletes])

  // removes multiple items at once, or clears the whole cart if no ids are passed
  // with ids: undoable like single remove; { immediate: true } deletes right away
  // (checkout uses immediate so no Undo toast appears after an order is placed)
  // the server needs an explicit productIds list, so a whole-cart clear sends
  // every current id instead of an empty body (which the API rejects)
  const clearCart = useCallback(async (ids = null, opts = {}) => {
    if (!ids) {
      const all = cartItemsRef.current
      const entries = all.map((item, index) => ({ item, index }))
      const allIds = all.map((item) => item.id)
      setCartItems([])
      if (allIds.length === 0) return
      if (opts.immediate) {
        await deleteCartRows(allIds, 'your cart')
        return
      }
      const timer = setTimeout(() => { flushPendingDeletes(allIds, 'your cart') }, UNDO_WINDOW_MS)
      showUndoToast('Cart cleared', () => {
        clearTimeout(timer)
        setCartItems((prev) => restoreAtIndices(prev, entries))
      })
      return
    }
    if (ids.length === 0) return

    const setIds = new Set(ids)
    const removedEntries = cartItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => setIds.has(item.id))
    const removedItems = removedEntries.map(({ item }) => item)
    setCartItems((prev) => prev.filter((item) => !setIds.has(item.id)))

    if (removedItems.length === 0 || opts.immediate) {
      await deleteCartRows(
        ids,
        removedItems.length === 1 ? removedItems[0].name : `${removedItems.length} items`
      )
      return
    }

    const flushLabel = removedItems.length === 1 ? removedItems[0].name : `${removedItems.length} items`
    const timer = setTimeout(() => { flushPendingDeletes(ids, flushLabel) }, UNDO_WINDOW_MS)
    showUndoToast(
      removedItems.length === 1
        ? `${removedItems[0].name} removed from cart`
        : `Removed ${removedItems.length} items from cart`,
      () => {
        clearTimeout(timer)
        setCartItems((prev) => restoreAtIndices(prev, removedEntries))
      }
    )
  }, [cartItems, deleteCartRows, flushPendingDeletes])

  // total number of individual items in the cart (accounts for quantity)
  // this is what shows up on the cart badge in the navbar
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  )

  // everything we expose to the rest of the app through useShop()
  // cartStatus / reloadCart are additive; existing contracts are unchanged
  const value = {
    cartItems,
    cartCount,
    cartStatus,
    reloadCart,
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
