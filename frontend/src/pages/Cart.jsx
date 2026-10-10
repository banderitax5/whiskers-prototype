import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'

function Cart() {
  const navigate = useNavigate()
  const { cartItems, updateQuantity, removeFromCart, clearCart, pushNotification } = useShop()
  const [selectedIds, setSelectedIds] = useState([])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const selectedTotal = useMemo(() => {
    return cartItems
      .filter((item) => selectedSet.has(item.id))
      .reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, [cartItems, selectedSet])

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function selectAll() {
    setSelectedIds(cartItems.map((item) => item.id))
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function goCheckout() {
    if (selectedIds.length === 0) return
    navigate('/checkout', { state: { selectedIds } })
  }

  const btnBase = "h-9 rounded-lg px-3 text-xs font-semibold transition-colors"

  return (
    <div className="w-full lg:mx-auto lg:max-w-7xl py-5 sm:py-8">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0b2e59] dark:text-white">Your Cart</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{cartItems.length} item type{cartItems.length !== 1 && 's'} in cart</p>
      </div>

      {cartItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-20 px-6 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.09-.773 2.34-1.872l1.836-7.89a1.125 1.125 0 00-1.098-1.368H5.173M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Your cart is empty</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm">Browse our products and add items you love to get started.</p>
          <button
            type="button"
            onClick={() => navigate('/menu')}
            className="mt-6 h-11 rounded-lg bg-[#0b2e59] px-8 text-sm font-semibold text-white hover:bg-[#15407a] transition-colors"
          >
            Browse Products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 lg:gap-6">
          {/* left column — cart items */}
          <div className="space-y-3">
            {/* bulk actions */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={selectAll} className={`${btnBase} border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200`}>
                  Select All
                </button>
                <button type="button" onClick={clearSelection} className={`${btnBase} border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200`}>
                  Clear
                </button>
                <button
                  type="button"
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    clearCart(selectedIds)
                    pushNotification(`Removed ${selectedIds.length} item(s) from cart`, 'info')
                    setSelectedIds([])
                  }}
                  className={`${btnBase} border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Remove Selected
                </button>
              </div>
            </div>

            {/* cart items */}
            {cartItems.map((item) => (
              <article key={item.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
                {/* mobile: stacks vertically */}
                <div className="flex gap-4">
                  <label className="mt-1 inline-flex flex-shrink-0 items-start">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="h-5 w-5 rounded border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                    />
                  </label>

                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-700">
                    <img src={item.image} alt={item.name} loading="lazy" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{item.name}</h3>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {[item.collection, item.brand].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-white">PHP {item.price.toFixed(2)}</p>
                    </div>

                    {/* mobile: qty + subtotal + remove in a row */}
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 pt-3 sm:border-0 sm:pt-0 sm:mt-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                          aria-label={`Quantity for ${item.name}`}
                          className="h-8 w-16 sm:w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 text-sm text-center dark:text-gray-100"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-bold text-[#0b2e59] dark:text-yellow-300">PHP {(item.price * item.quantity).toFixed(2)}</p>
                        <button type="button" onClick={() => removeFromCart(item.id)} className="text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* right column — summary (sticky on desktop) */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Order Summary</h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Selected items</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedIds.length}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">PHP {selectedTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Shipping</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">PHP 75.00</span>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <div className="flex justify-between text-base font-bold text-[#0b2e59] dark:text-yellow-300">
                  <span>Total</span>
                  <span>PHP {(selectedTotal + (selectedIds.length > 0 ? 75 : 0)).toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={goCheckout}
                disabled={selectedIds.length === 0}
                className="w-full h-11 rounded-lg bg-[#0b2e59] text-sm font-semibold text-white hover:bg-[#15407a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cart
