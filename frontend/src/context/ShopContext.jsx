/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { sileo } from 'sileo'

const ShopContext = createContext(null)

const CART_KEY = 'pc_cart_v1'

function normalizeItem(product, quantity = 1) {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price) || 0,
    image: product.image || '',
    collection: product.collection || '',
    brand: product.brand || '',
    quantity,
  }
}

export function ShopProvider({ children }) {
  const [cartItems, setCartItems] = useState([])
  const [lastAddedAt, setLastAddedAt] = useState(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setCartItems(parsed)
    } catch {
      // ignore malformed cart payload
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartItems))
  }, [cartItems])

  function pushNotification(message, type = 'success') {
    const payload = { title: message }
    if (type === 'error') sileo.error(payload)
    else if (type === 'warning') sileo.warning(payload)
    else if (type === 'info') sileo.info(payload)
    else sileo.success(payload)
  }

  function addToCart(product, quantity = 1, opts = { notify: true }) {
    const qty = Math.max(1, Number(quantity) || 1)
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        )
      }
      return [...prev, normalizeItem(product, qty)]
    })
    setLastAddedAt(Date.now())
    if (opts.notify) {
      pushNotification(`${product.name} added to cart`, 'success')
    }
  }

  function updateQuantity(id, quantity) {
    const qty = Math.max(1, Number(quantity) || 1)
    setCartItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: qty } : item))
    )
  }

  function removeFromCart(id) {
    const removed = cartItems.find((item) => item.id === id)
    setCartItems((prev) => prev.filter((item) => item.id !== id))
    if (removed) pushNotification(`${removed.name} removed from cart`, 'info')
  }

  function clearCart(ids = null) {
    if (!ids) {
      setCartItems([])
      return
    }
    const setIds = new Set(ids)
    setCartItems((prev) => prev.filter((item) => !setIds.has(item.id)))
  }

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  )

  const value = {
    cartItems,
    cartCount,
    lastAddedAt,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    pushNotification,
  }

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used inside ShopProvider')
  return ctx
}

