import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function Checkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { cartItems, clearCart, pushNotification, session } = useShop()

  const selectedIds = useMemo(() => location.state?.selectedIds || [], [location.state?.selectedIds])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const checkoutItems = useMemo(() => {
    if (selectedIds.length === 0) return cartItems
    return cartItems.filter((item) => selectedSet.has(item.id))
  }, [cartItems, selectedIds, selectedSet])

  const subtotal = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [checkoutItems]
  )
  const shippingFee = checkoutItems.length > 0 ? 75 : 0
  const total = subtotal + shippingFee

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    paymentMethod: 'gcash',
  })
  const [submitting, setSubmitting] = useState(false)

  function onChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submitOrder(e) {
    e.preventDefault()
    if (checkoutItems.length === 0 || submitting) return

    const token = session?.access_token
    if (!token) {
      pushNotification('Please sign in to place an order', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: checkoutItems.map((i) => ({
            productId: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
          paymentMethod: form.paymentMethod,
          shippingFee,
          customerName: form.fullName,
          phone: form.phone,
          address: [form.addressLine1, form.addressLine2, form.city, form.province, form.postalCode].filter(Boolean).join(', '),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to place order')
      }

      const { order_id } = await res.json()
      clearCart(selectedIds.length > 0 ? selectedIds : null)
      pushNotification('Order placed successfully!')
      navigate('/orders', { state: { newOrderId: order_id } })
    } catch (err) {
      pushNotification(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "h-10 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm dark:text-gray-100"

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <h1 className="mb-4 text-2xl font-bold text-[#0b2e59] dark:text-white">Order Delivery Details</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={submitOrder} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">Delivery Information</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input required value={form.fullName} onChange={(e) => onChange('fullName', e.target.value)} placeholder="Full Name" className={inputClass} />
            <input required value={form.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="Phone Number" className={inputClass} />
          </div>
          <div className="mt-3 space-y-3">
            <input required value={form.addressLine1} onChange={(e) => onChange('addressLine1', e.target.value)} placeholder="Address Line 1" className={`${inputClass} w-full`} />
            <input value={form.addressLine2} onChange={(e) => onChange('addressLine2', e.target.value)} placeholder="Address Line 2 (optional)" className={`${inputClass} w-full`} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input required value={form.city} onChange={(e) => onChange('city', e.target.value)} placeholder="City" className={inputClass} />
              <input required value={form.province} onChange={(e) => onChange('province', e.target.value)} placeholder="Province" className={inputClass} />
              <input required value={form.postalCode} onChange={(e) => onChange('postalCode', e.target.value)} placeholder="Postal Code" className={inputClass} />
            </div>
          </div>

          <h2 className="mb-3 mt-5 text-lg font-semibold text-gray-800 dark:text-gray-100">Payment Method</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { value: 'gcash', label: 'GCash' },
              { value: 'paymaya', label: 'PayMaya' },
              { value: 'cod', label: 'Cash on Delivery' },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-2">
                <input type="radio" name="paymentMethod" value={option.value} checked={form.paymentMethod === option.value} onChange={(e) => onChange('paymentMethod', e.target.value)} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{option.label}</span>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={checkoutItems.length === 0 || submitting}
            className="mt-5 h-10 rounded-md bg-[#0b2e59] px-5 text-sm font-semibold text-white hover:bg-[#15407a] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Placing Order...' : 'Place Order'}
          </button>
        </form>

        <aside className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm h-max lg:sticky lg:top-24">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">Order Summary</h2>
          <div className="space-y-2">
            {checkoutItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800 dark:text-gray-100">{item.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Qty {item.quantity}</p>
                </div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">PHP {(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
            {checkoutItems.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No selected items for checkout.</p>
            )}
          </div>
          <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1 text-sm dark:text-gray-300">
            <div className="flex justify-between"><span>Subtotal</span><span>PHP {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span>PHP {shippingFee.toFixed(2)}</span></div>
            <div className="mt-2 flex justify-between text-base font-bold text-[#0b2e59] dark:text-yellow-300"><span>Total</span><span>PHP {total.toFixed(2)}</span></div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default Checkout
