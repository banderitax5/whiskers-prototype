import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { trackEvent } from '../lib/appEvents.js'
import { philippinesData } from '../data/philippinesData.js'
import { paymentMethodLabel } from '../lib/orderDoc.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const FIELD_ORDER = ['fullName', 'phone', 'addressLine1', 'city', 'province', 'postalCode']

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
  const [fieldErrors, setFieldErrors] = useState({})
  const accessToken = session?.access_token

  // prefill delivery details from the saved profile
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => {
        if (!p || cancelled) return
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || [p.firstName, p.lastName].filter(Boolean).join(' '),
          phone: prev.phone || p.phone || '',
          addressLine1: prev.addressLine1 || p.addressLine1 || '',
          addressLine2: prev.addressLine2 || p.addressLine2 || '',
          city: prev.city || p.city || '',
          province: prev.province || p.province || '',
          postalCode: prev.postalCode || p.postalCode || '',
        }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [accessToken])

  function onChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  // scrolling to and focusing the first invalid field after a failed submit
  function focusFirstError(errs) {
    const firstKey = FIELD_ORDER.find((k) => errs[k])
    if (!firstKey) return
    const el = document.querySelector(`[data-field="${firstKey}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus({ preventScroll: true })
    }
  }

  function validate() {
    const errs = {}
    if (!form.fullName.trim()) errs.fullName = 'Full name is required.'
    else if (form.fullName.trim().length < 2) errs.fullName = 'Name must be at least 2 characters.'
    const digits = form.phone.replace(/[^0-9]/g, '')
    if (!digits) errs.phone = 'Phone number is required.'
    else if (digits.length < 11) errs.phone = 'Phone must have at least 11 digits.'
    if (!form.addressLine1.trim()) errs.addressLine1 = 'Address is required.'
    if (!form.city.trim()) errs.city = 'City is required.'
    if (!form.province.trim()) errs.province = 'Province is required.'
    if (!form.postalCode.trim()) errs.postalCode = 'Postal code is required.'
    else if (!/^[0-9]{4}$/.test(form.postalCode.trim())) errs.postalCode = 'Postal code must be exactly 4 digits.'
    return errs
  }

  async function submitOrder(e) {
    e.preventDefault()
    if (checkoutItems.length === 0 || submitting) return

    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      focusFirstError(errs)
      return
    }

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
      clearCart(selectedIds.length > 0 ? selectedIds : null, { immediate: true })
      pushNotification('Order placed successfully!')
      trackEvent('checkout_complete', { order_id, total, items: checkoutItems.length })
      navigate(`/orders/${order_id}`)
    } catch (err) {
      pushNotification(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "h-10 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm dark:text-gray-100"
  const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"

  return (
    <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
      <h1 className="mb-4 text-2xl font-bold text-[#0b2e59] dark:text-white">Order Delivery Details</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={submitOrder} noValidate className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">Delivery Information</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="co-fullName" className={labelClass}>Full Name</label>
              <input id="co-fullName" data-field="fullName" required value={form.fullName} onChange={(e) => onChange('fullName', e.target.value)} placeholder="Juan Dela Cruz" className={`${inputClass} w-full ${fieldErrors.fullName ? 'border-red-500' : ''}`} />
              {fieldErrors.fullName && <p className="text-xs text-red-500 mt-1">{fieldErrors.fullName}</p>}
            </div>
            <div>
              <label htmlFor="co-phone" className={labelClass}>Phone Number</label>
              <input id="co-phone" data-field="phone" required value={form.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="09XXXXXXXXX" inputMode="numeric" className={`${inputClass} w-full ${fieldErrors.phone ? 'border-red-500' : ''}`} />
              {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="co-addressLine1" className={labelClass}>Address Line 1</label>
              <input id="co-addressLine1" data-field="addressLine1" required value={form.addressLine1} onChange={(e) => onChange('addressLine1', e.target.value)} placeholder="House no., street, barangay" className={`${inputClass} w-full ${fieldErrors.addressLine1 ? 'border-red-500' : ''}`} />
              {fieldErrors.addressLine1 && <p className="text-xs text-red-500 mt-1">{fieldErrors.addressLine1}</p>}
            </div>
            <div>
              <label htmlFor="co-addressLine2" className={labelClass}>Address Line 2 <span className="text-gray-400">(optional)</span></label>
              <input id="co-addressLine2" value={form.addressLine2} onChange={(e) => onChange('addressLine2', e.target.value)} placeholder="Building, floor, unit" className={`${inputClass} w-full`} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="co-province" className={labelClass}>Province</label>
                <select
                  id="co-province"
                  data-field="province"
                  required
                  value={form.province}
                  onChange={(e) => {
                    const value = e.target.value
                    setForm((prev) => ({ ...prev, province: value, city: '' }))
                    setFieldErrors((prev) => ({ ...prev, province: value ? '' : 'Province is required.', city: '' }))
                  }}
                  className={`${inputClass} w-full ${fieldErrors.province ? 'border-red-500' : ''}`}
                >
                  <option value="">Select Province</option>
                  {Object.keys(philippinesData).map((p) => <option key={p}>{p}</option>)}
                </select>
                {fieldErrors.province && <p className="text-xs text-red-500 mt-1">{fieldErrors.province}</p>}
              </div>
              <div>
                <label htmlFor="co-city" className={labelClass}>City</label>
                <select
                  id="co-city"
                  data-field="city"
                  required
                  value={form.city}
                  onChange={(e) => onChange('city', e.target.value)}
                  disabled={!form.province}
                  className={`${inputClass} w-full ${fieldErrors.city ? 'border-red-500' : ''}`}
                >
                  <option value="">Select City</option>
                  {(philippinesData[form.province] || []).map((c) => <option key={c}>{c}</option>)}
                </select>
                {fieldErrors.city && <p className="text-xs text-red-500 mt-1">{fieldErrors.city}</p>}
              </div>
              <div>
                <label htmlFor="co-postalCode" className={labelClass}>Postal Code</label>
                <input id="co-postalCode" data-field="postalCode" required value={form.postalCode} onChange={(e) => onChange('postalCode', e.target.value)} placeholder="1234" inputMode="numeric" maxLength={4} className={`${inputClass} w-full ${fieldErrors.postalCode ? 'border-red-500' : ''}`} />
                {fieldErrors.postalCode && <p className="text-xs text-red-500 mt-1">{fieldErrors.postalCode}</p>}
              </div>
            </div>
          </div>

          <h2 className="mb-3 mt-5 text-lg font-semibold text-gray-800 dark:text-gray-100">Payment Method</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
            {[
              { value: 'gcash', label: 'GCash' },
              { value: 'paymaya', label: 'PayMaya' },
              { value: 'cod', label: 'Cash on Delivery' },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-2 cursor-pointer has-[:checked]:border-[#0b2e59] has-[:checked]:bg-[#0b2e59]/5">
                <input type="radio" name="paymentMethod" value={option.value} checked={form.paymentMethod === option.value} onChange={(e) => onChange('paymentMethod', e.target.value)} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {form.paymentMethod === 'cod'
              ? 'Pay in cash when your order arrives.'
              : `You will receive payment instructions for ${paymentMethodLabel(form.paymentMethod)} after placing the order.`}
          </p>

          {/* review summary before placing the order */}
          <div className="mt-5 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">Review</p>
            <dl className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex justify-between gap-3"><dt>Deliver to</dt><dd className="font-medium text-right truncate">{form.fullName || '—'}{form.city ? `, ${form.city}` : ''}{form.province ? `, ${form.province}` : ''}</dd></div>
              <div className="flex justify-between gap-3"><dt>Phone</dt><dd className="font-medium">{form.phone || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Payment</dt><dd className="font-medium">{paymentMethodLabel(form.paymentMethod)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Items</dt><dd className="font-medium">{checkoutItems.length}</dd></div>
              <div className="flex justify-between gap-3 border-t border-gray-200 dark:border-gray-700 pt-1 mt-1"><dt className="font-bold">Total</dt><dd className="font-bold">PHP {total.toFixed(2)}</dd></div>
            </dl>
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
