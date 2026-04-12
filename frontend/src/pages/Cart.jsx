import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'

function Cart() {
  const navigate = useNavigate()
  const { cartItems, updateQuantity, removeFromCart } = useShop()
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[#0b2e59] dark:text-white">Your Cart</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{cartItems.length} item types in cart</p>
      </div>

      {cartItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          Your cart is empty.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={selectAll} className="h-9 rounded-md border border-gray-200 dark:border-gray-600 px-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200">
                Select All
              </button>
              <button type="button" onClick={clearSelection} className="h-9 rounded-md border border-gray-200 dark:border-gray-600 px-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200">
                Clear Selection
              </button>
            </div>
          </div>

          {cartItems.map((item) => (
            <article key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="h-5 w-5 rounded-full border-gray-300 text-[#0b2e59] focus:ring-[#0b2e59]"
                  />
                </label>

                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md bg-gray-50 dark:bg-gray-700">
                  <img src={item.image} alt={item.name} className="h-12 w-12 object-contain" />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.name}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.collection} {item.brand ? `· ${item.brand}` : ''}</p>
                  <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">PHP {item.price.toFixed(2)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                    className="h-9 w-20 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 text-sm dark:text-gray-100"
                  />
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Subtotal</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">PHP {(item.price * item.quantity).toFixed(2)}</p>
                  <button type="button" onClick={() => removeFromCart(item.id)} className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Selected: <span className="font-semibold">{selectedIds.length}</span> item types
              </p>
              <p className="text-lg font-bold text-[#0b2e59] dark:text-yellow-300">Total: PHP {selectedTotal.toFixed(2)}</p>
              <button
                type="button"
                onClick={goCheckout}
                disabled={selectedIds.length === 0}
                className="h-10 rounded-md bg-[#0b2e59] px-5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#15407a]"
              >
                Checkout Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cart
