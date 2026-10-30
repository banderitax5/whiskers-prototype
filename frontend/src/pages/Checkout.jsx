import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import useLiveProductRows from '../hooks/useLiveProductRows.js'
import ProductThumb from '../components/ProductThumb.jsx'
import { trackEvent } from '../lib/appEvents.js'
import { philippinesData } from '../data/philippinesData.js'
import { paymentMethodLabel } from '../lib/orderDoc.js'
import { phoneError, addressLineError, postalError } from '../lib/addressValidation.js'
import toast from '../lib/toast.js'
import supabase from '../lib/supabase'
import {
  cartTotals,
  effectiveItems,
  isPurchasableStatus,
  unavailableReason,
  formatPesos,
  toCentavos,
} from '../lib/cartLogic.js'
import { fetchSiteContent, contentSettings } from '../lib/siteContent.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// built-in payment options (fallback until site settings are saved)
const DEFAULT_PAYMENT_OPTIONS = [
  { id: 'gcash', label: 'GCash', enabled: true, instructions: '', qr_url: null },
  { id: 'paymaya', label: 'PayMaya', enabled: true, instructions: '', qr_url: null },
  { id: 'cod', label: 'Cash on Delivery', enabled: true, instructions: '', qr_url: null },
]
const SELECTION_KEY = 'whiskers.cart.selectedIds'

const FIELD_ORDER = ['fullName', 'phone', 'addressLine1', 'addressLine2', 'city', 'province', 'postalCode']

function readStoredSelection() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

// last-second price/stock re-check before an order is placed (C2). Fails
// open on network errors: the server recomputes prices and rejects
// unavailable items anyway, so this is a UX guard, not the security boundary.
async function verifyPricesAndStock(items) {
  const ids = items.map((i) => i.id)
  const { data, error } = await supabase
    .from('product')
    .select('prod_id, price, stock_quantity, is_active')
    .in('prod_id', ids)
  if (error || !Array.isArray(data)) return []
  const map = new Map(data.map((row) => [row.prod_id, row]))
  const problems = []
  for (const item of items) {
    const row = map.get(item.id)
    if (!row || row.is_active === false) {
      problems.push(`${item.name} is no longer available.`)
      continue
    }
    const price = Number(row.price)
    const stock = Number(row.stock_quantity || 0)
    if (!(price > 0)) problems.push(`${item.name} is not yet priced and cannot be purchased.`)
    else if (stock <= 0) problems.push(`${item.name} is out of stock.`)
    else if (item.quantity > stock) problems.push(`Only ${stock} of ${item.name} left in stock.`)
    else if (toCentavos(price) !== toCentavos(item.price)) {
      problems.push(`The price of ${item.name} changed from PHP ${formatPesos(item.price)} to PHP ${formatPesos(price)}.`)
    }
  }
  return problems
}

function Checkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { cartItems, cartStatus, clearCart, pushNotification, session, authReady, openLogin } = useShop()

  // ids travel through router state; sessionStorage keeps the selection alive
  // when the user comes back via the back button (U9)
  const selectedIds = useMemo(() => {
    const fromState = location.state?.selectedIds
    if (Array.isArray(fromState) && fromState.length > 0) return fromState
    return readStoredSelection()
  }, [location.state?.selectedIds])

  // cart rows with their live status (B6) — same helper the cart page uses
  const { availability } = useLiveProductRows(cartItems)
  const pricedItems = useMemo(
    () => cartItems.map((item) => ({ ...item, price: availability[item.id]?.price ?? item.price })),
    [cartItems, availability]
  )

  // only rows that still exist and can be ordered are ever checked out (B2/B6)
  const checkoutItems = useMemo(
    () => effectiveItems(selectedIds, pricedItems, availability),
    [selectedIds, pricedItems, availability]
  )
  // selected rows that exist but cannot be ordered right now — surfaced so
  // the user knows why the order cannot continue
  const blockedItems = useMemo(() => {
    const selected = new Set(selectedIds)
    return pricedItems.filter(
      (item) => selected.has(item.id) && !isPurchasableStatus(availability[item.id]?.status)
    )
  }, [selectedIds, pricedItems, availability])

  // site settings (Phase 6): payment methods on/off + labels/instructions,
  // shipping fee + free-shipping threshold. Falls back to the built-in
  // methods and flat fee until the owner saves settings.
  const [shopSettings, setShopSettings] = useState(null)
  const [shippingOpts, setShippingOpts] = useState(null)
  const paymentOptions = useMemo(() => {
    const raw = shopSettings?.payment_methods
    const list = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_PAYMENT_OPTIONS
    const enabled = list.filter((m) => m && m.enabled !== false)
    return enabled.length > 0 ? enabled : DEFAULT_PAYMENT_OPTIONS
  }, [shopSettings])

  const totals = useMemo(() => cartTotals(checkoutItems, availability, shippingOpts), [checkoutItems, availability, shippingOpts])

  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((content) => {
      if (cancelled) return
      const s = contentSettings(content)
      setShopSettings(s)
      setShippingOpts({ fee: s.shipping_fee, freeThreshold: s.free_shipping_threshold })
    })
    return () => { cancelled = true }
  }, [])

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    paymentMethod: 'gcash',
    promoCode: '',
  })
  const selectedPayment = useMemo(
    () => paymentOptions.find((m) => m.id === form.paymentMethod) || null,
    [paymentOptions, form.paymentMethod]
  )
  // if the stored method was disabled in settings, fall back to the first one
  // (effects run after render, so onChange below is initialized by then)
  useEffect(() => {
    if (!paymentOptions.some((m) => m.id === form.paymentMethod)) {
      onChange('paymentMethod', paymentOptions[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOptions])
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [verifyProblems, setVerifyProblems] = useState([])
  const [promoError, setPromoError] = useState('')
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [appliedPromo, setAppliedPromo] = useState('')
  const [checkingPromo, setCheckingPromo] = useState(false)
  const summaryRef = useRef(null)
  const redirectedRef = useRef(false)
  // set once an order is placed so clearing the cart cannot trigger the
  // "no selection" redirect on the way to the confirmation page
  const placedRef = useRef(false)
  // idempotency key: generated once per component mount, sent with POST /orders
  // prevents double-order on network retry or double-click (backend upserts on key)
  const idempotencyKeyRef = useRef(crypto.randomUUID())
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

  // no valid selection once the cart has loaded -> back to the cart (B2).
  // signed-out visitors get the sign-in prompt instead of a redirect loop.
  useEffect(() => {
    if (redirectedRef.current || placedRef.current || !session || cartStatus !== 'ready') return
    if (checkoutItems.length > 0) return
    redirectedRef.current = true
    pushNotification(
      blockedItems.length > 0
        ? 'Some selected items are no longer available — please review your cart.'
        : 'Select at least one item in your cart to check out.',
      'info'
    )
    navigate('/cart', { replace: true })
  }, [session, cartStatus, checkoutItems.length, blockedItems.length, navigate, pushNotification])

  function onChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }))
    if (key === 'promoCode') {
      setPromoError('')
      // editing the code clears a previously applied promo until re-applied
      if (appliedPromo) {
        setAppliedPromo('')
        setPromoDiscount(0)
      }
    }
    if (verifyProblems.length) setVerifyProblems([])
  }

  // validate the typed promo code against the current cart before the order
  // is placed; the server re-validates at checkout so this is a UX preview
  async function applyPromo() {
    const code = form.promoCode.trim().toUpperCase()
    if (!code || checkingPromo) return
    setCheckingPromo(true)
    setPromoError('')
    try {
      const res = await fetch(`${API_BASE}/orders/validate-promo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          items: checkoutItems.map((i) => ({ productId: i.id, quantity: i.quantity })),
          promo_code: code,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Promo code could not be applied')
      }
      const data = await res.json().catch(() => ({}))
      setAppliedPromo(code)
      setPromoDiscount(Number(data.discount || 0))
      trackEvent('promo_applied', { code, discount: data.discount })
    } catch (err) {
      setPromoError(err.message)
      setAppliedPromo('')
      setPromoDiscount(0)
    } finally {
      setCheckingPromo(false)
    }
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
    const phoneMsg = phoneError(form.phone, { required: true })
    if (phoneMsg) errs.phone = phoneMsg
    const line1Msg = addressLineError(form.addressLine1, { required: true })
    if (line1Msg) errs.addressLine1 = line1Msg
    const line2Msg = addressLineError(form.addressLine2, { required: false })
    if (line2Msg) errs.addressLine2 = line2Msg
    if (!form.city.trim()) errs.city = 'City is required.'
    if (!form.province.trim()) errs.province = 'Province is required.'
    const postalMsg = postalError(form.postalCode, { required: true })
    if (postalMsg) errs.postalCode = postalMsg
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
      // re-check price and stock right before submitting (C2)
      const problems = await verifyPricesAndStock(checkoutItems)
      if (problems.length > 0) {
        setVerifyProblems(problems)
        pushNotification('Some items changed — please review your cart.', 'error')
        return
      }
      setVerifyProblems([])

      const orderedIds = checkoutItems.map((i) => i.id)
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          // the server recomputes prices and shipping; these are display hints
          items: checkoutItems.map((i) => ({
            productId: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
          paymentMethod: form.paymentMethod,
          customerName: form.fullName,
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          province: form.province,
          postalCode: form.postalCode,
          promo_code: form.promoCode.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 400 && data.error && data.error.toLowerCase().includes('promo')) {
          setPromoError(data.error)
          throw new Error(data.error)
        }
        throw new Error(data.error || 'Failed to place order')
      }

      const { order_id, checkout_url: checkoutUrl, receipt_email_sent: receiptEmailed } = await res.json()
      placedRef.current = true
      try { sessionStorage.removeItem(SELECTION_KEY) } catch { /* ignore */ }
      if (checkoutUrl) {
        // gateway order: the cart stays until money arrives (abandon = retry
        // with the cart intact; expiry returns the stock) - the pay page
        // clears it on success. No receipt claim here either: that email only
        // goes out when payment succeeds.
        pushNotification('Order placed. Complete your payment to confirm it.', 'info')
        // hosted gateways return an external URL (full navigation); the
        // simulated pay page is an SPA route
        if (/^https?:\/\//i.test(checkoutUrl)) {
          window.location.assign(checkoutUrl)
          return
        }
        navigate(checkoutUrl)
        return
      }
      clearCart(orderedIds, { immediate: true })
      pushNotification('Order placed successfully!')
      trackEvent('checkout_complete', { order_id, total: totals.totalCents / 100, items: checkoutItems.length })
      navigate(`/orders/${order_id}`, { state: { receiptEmailed: Boolean(receiptEmailed) } })
    } catch (err) {
      pushNotification(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Guests may fill a cart freely; only placing the order needs an account.
  // Landing here signed out opens the sign-in modal immediately AND keeps a
  // toast on screen at the same time, so the reason for the interruption is
  // readable instead of being a modal that appears out of nowhere.
  const promptedRef = useRef(false)
  const promptToastRef = useRef(null)
  useEffect(() => {
    if (!authReady || session || promptedRef.current) return
    promptedRef.current = true
    openLogin()
    promptToastRef.current = pushNotification('Sign in to place your order — your cart is saved.', 'info')
  }, [authReady, session, openLogin, pushNotification])

  // once the shopper is in, the "please sign in" note has done its job
  useEffect(() => {
    if (!session || promptToastRef.current == null) return
    toast.dismiss(promptToastRef.current)
    promptToastRef.current = null
  }, [session])

  const inputClass = "h-11 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm dark:text-gray-100"
  const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"

  // until Supabase reports the session we cannot tell a guest from a shopper
  // who is merely still loading, and prompting the wrong one would be rude
  if (!authReady) {
    return (
      <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
        <h1 className="mb-4 text-2xl font-bold text-[#0b2e59] dark:text-white">Checkout</h1>
        <div role="status" aria-label="Loading checkout" className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-700/60" />
          <div className="mx-auto mt-6 h-11 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  // signed-out visitors see a sign-in prompt instead of the form (C1)
  if (!session) {
    return (
      <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
        <h1 className="mb-4 text-2xl font-bold text-[#0b2e59] dark:text-white">Checkout</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Sign in to check out</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Your cart is saved — sign in to continue with your order.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={openLogin}
              className="min-h-[44px] rounded-lg bg-[#0b2e59] px-6 text-sm font-semibold text-white hover:bg-[#15407a] transition-colors"
            >
              Sign in
            </button>
            <Link
              to="/cart"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-200 px-6 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Edit cart
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const errorEntries = FIELD_ORDER.filter((k) => fieldErrors[k]).map((k) => [k, fieldErrors[k]])

  return (
    <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#0b2e59] dark:text-white">Order Delivery Details</h1>
        <Link to="/cart" className="text-sm font-semibold text-[#0b2e59] hover:text-[#15407a] dark:text-blue-400 dark:hover:text-blue-300">
          Edit cart
        </Link>
      </div>

      {/* items that dropped out of the order (B6) */}
      {blockedItems.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-semibold">Some items cannot be ordered:</p>
          <ul className="mt-1 list-disc pl-5">
            {blockedItems.map((item) => (
              <li key={item.id}>{item.name} — {unavailableReason(availability[item.id]?.status)}</li>
            ))}
          </ul>
          <Link to="/cart" className="mt-2 inline-flex font-semibold underline">Review your cart</Link>
        </div>
      )}

      {/* re-check failures before submit (C2) */}
      {verifyProblems.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          <p className="font-semibold">Please review your cart before placing the order:</p>
          <ul className="mt-1 list-disc pl-5">
            {verifyProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <Link to="/cart" className="mt-2 inline-flex font-semibold underline">Go to cart</Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={submitOrder} noValidate className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          {/* validation error summary (B9) */}
          {errorEntries.length > 0 && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
            >
              <p className="font-semibold">Please fix the following before placing your order:</p>
              <ul className="mt-1 list-disc pl-5">
                {errorEntries.map(([key, message]) => (
                  <li key={key}>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        const el = document.querySelector(`[data-field="${key}"]`)
                        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }) }
                      }}
                    >
                      {message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">Delivery Information</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="co-fullName" className={labelClass}>Full Name</label>
              <input
                id="co-fullName"
                data-field="fullName"
                required
                value={form.fullName}
                onChange={(e) => onChange('fullName', e.target.value)}
                placeholder="Juan Dela Cruz"
                aria-invalid={fieldErrors.fullName ? 'true' : undefined}
                aria-describedby={fieldErrors.fullName ? 'co-fullName-err' : undefined}
                className={`${inputClass} w-full ${fieldErrors.fullName ? 'border-red-500' : ''}`}
              />
              {fieldErrors.fullName && <p id="co-fullName-err" className="text-xs text-red-500 mt-1">{fieldErrors.fullName}</p>}
            </div>
            <div>
              <label htmlFor="co-phone" className={labelClass}>Phone Number</label>
              <input
                id="co-phone"
                data-field="phone"
                required
                value={form.phone}
                onChange={(e) => onChange('phone', e.target.value)}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                aria-invalid={fieldErrors.phone ? 'true' : undefined}
                aria-describedby={fieldErrors.phone ? 'co-phone-err' : undefined}
                className={`${inputClass} w-full ${fieldErrors.phone ? 'border-red-500' : ''}`}
              />
              {fieldErrors.phone && <p id="co-phone-err" className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="co-addressLine1" className={labelClass}>Address Line 1</label>
              <input
                id="co-addressLine1"
                data-field="addressLine1"
                required
                value={form.addressLine1}
                onChange={(e) => onChange('addressLine1', e.target.value)}
                placeholder="House no., street, barangay"
                aria-invalid={fieldErrors.addressLine1 ? 'true' : undefined}
                aria-describedby={fieldErrors.addressLine1 ? 'co-addressLine1-err' : undefined}
                className={`${inputClass} w-full ${fieldErrors.addressLine1 ? 'border-red-500' : ''}`}
              />
              {fieldErrors.addressLine1 && <p id="co-addressLine1-err" className="text-xs text-red-500 mt-1">{fieldErrors.addressLine1}</p>}
            </div>
            <div>
              <label htmlFor="co-addressLine2" className={labelClass}>Address Line 2 <span className="text-gray-400">(optional)</span></label>
              <input
                id="co-addressLine2"
                data-field="addressLine2"
                value={form.addressLine2}
                onChange={(e) => onChange('addressLine2', e.target.value)}
                placeholder="Building, floor, unit"
                aria-invalid={fieldErrors.addressLine2 ? 'true' : undefined}
                aria-describedby={fieldErrors.addressLine2 ? 'co-addressLine2-err' : undefined}
                className={`${inputClass} w-full ${fieldErrors.addressLine2 ? 'border-red-500' : ''}`}
              />
              {fieldErrors.addressLine2 && <p id="co-addressLine2-err" className="text-xs text-red-500 mt-1">{fieldErrors.addressLine2}</p>}
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
                  aria-invalid={fieldErrors.province ? 'true' : undefined}
                  aria-describedby={fieldErrors.province ? 'co-province-err' : undefined}
                  className={`${inputClass} w-full ${fieldErrors.province ? 'border-red-500' : ''}`}
                >
                  <option value="">Select Province</option>
                  {Object.keys(philippinesData).map((p) => <option key={p}>{p}</option>)}
                </select>
                {fieldErrors.province && <p id="co-province-err" className="text-xs text-red-500 mt-1">{fieldErrors.province}</p>}
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
                  aria-invalid={fieldErrors.city ? 'true' : undefined}
                  aria-describedby={fieldErrors.city ? 'co-city-err' : undefined}
                  className={`${inputClass} w-full ${fieldErrors.city ? 'border-red-500' : ''}`}
                >
                  <option value="">Select City</option>
                  {(philippinesData[form.province] || []).map((c) => <option key={c}>{c}</option>)}
                </select>
                {fieldErrors.city && <p id="co-city-err" className="text-xs text-red-500 mt-1">{fieldErrors.city}</p>}
              </div>
              <div>
                <label htmlFor="co-postalCode" className={labelClass}>Postal Code</label>
                <input
                  id="co-postalCode"
                  data-field="postalCode"
                  required
                  value={form.postalCode}
                  onChange={(e) => onChange('postalCode', e.target.value)}
                  placeholder="1234"
                  inputMode="numeric"
                  maxLength={4}
                  aria-invalid={fieldErrors.postalCode ? 'true' : undefined}
                  aria-describedby={fieldErrors.postalCode ? 'co-postalCode-err' : undefined}
                  className={`${inputClass} w-full ${fieldErrors.postalCode ? 'border-red-500' : ''}`}
                />
                {fieldErrors.postalCode && <p id="co-postalCode-err" className="text-xs text-red-500 mt-1">{fieldErrors.postalCode}</p>}
              </div>
            </div>
          </div>

          <h2 className="mb-3 mt-5 text-lg font-semibold text-gray-800 dark:text-gray-100">Payment Method</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
            {paymentOptions.map((option) => (
              <label key={option.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 py-2 has-[:checked]:border-[#0b2e59] has-[:checked]:bg-[#0b2e59]/5 dark:border-gray-600">
                <input type="radio" name="paymentMethod" value={option.id} checked={form.paymentMethod === option.id} onChange={(e) => onChange('paymentMethod', e.target.value)} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {form.paymentMethod === 'cod'
              ? selectedPayment?.instructions || 'Pay in cash when your order arrives.'
              : `You will be redirected to a secure payment page after placing your order to complete payment with ${paymentMethodLabel(form.paymentMethod)}. Your order stays pending until the payment is confirmed.`}
          </p>
          {form.paymentMethod === 'cod' && selectedPayment?.qr_url && (
            <img
              src={selectedPayment.qr_url}
              alt={`${selectedPayment.label} QR code`}
              className="mt-3 h-28 w-28 rounded-md border border-gray-200 dark:border-gray-600 object-contain bg-white p-1"
            />
          )}

          {/* review summary before placing the order */}
          <div className="mt-5 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">Review</p>
            <dl className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex justify-between gap-3"><dt>Deliver to</dt><dd className="font-medium text-right truncate">{form.fullName || '—'}{form.city ? `, ${form.city}` : ''}{form.province ? `, ${form.province}` : ''}</dd></div>
              <div className="flex justify-between gap-3"><dt>Phone</dt><dd className="font-medium">{form.phone || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Payment</dt><dd className="font-medium">{selectedPayment?.label || paymentMethodLabel(form.paymentMethod)}</dd></div>
              <div className="flex justify-between gap-3">
                <dt>Items</dt>
                <dd className="font-medium">
                  {totals.products} product{totals.products === 1 ? '' : 's'} ({totals.units} item{totals.units === 1 ? '' : 's'})
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-1 mt-1 dark:border-gray-700"><dt className="font-bold">Total</dt><dd className="font-bold">PHP {formatPesos(Math.max(0, totals.totalCents / 100 - promoDiscount))}</dd></div>
            </dl>
          </div>

          {/* promo code input */}
          <div className="mt-4">
            <label htmlFor="co-promoCode" className={labelClass}>Promo Code <span className="text-gray-400">(optional)</span></label>
            <div className="flex gap-2">
              <input
                id="co-promoCode"
                type="text"
                value={form.promoCode}
                onChange={(e) => onChange('promoCode', e.target.value.toUpperCase())}
                placeholder="Enter promo code"
                className={`${inputClass} w-full flex-1 ${promoError ? 'border-red-500' : ''}`}
                aria-invalid={promoError ? 'true' : undefined}
                aria-describedby={promoError ? 'co-promoCode-err' : undefined}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={applyPromo}
                disabled={!form.promoCode.trim() || checkingPromo || submitting || !!appliedPromo}
                className="min-h-[44px] shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-4 text-xs font-black uppercase tracking-widest text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {checkingPromo ? 'Checking...' : appliedPromo ? 'Applied' : 'Apply'}
              </button>
            </div>
            {promoError && <p id="co-promoCode-err" className="text-xs text-red-500 mt-1">{promoError}</p>}
            {appliedPromo && promoDiscount > 0 && (
              <p className="mt-1 text-xs font-semibold text-green-700 dark:text-green-300">
                {appliedPromo} applied — you save PHP {formatPesos(promoDiscount)}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={checkoutItems.length === 0 || submitting}
            className="mt-5 min-h-[44px] rounded-md bg-[#0b2e59] px-5 text-sm font-semibold text-white hover:bg-[#15407a] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Placing Order...' : 'Place Order'}
          </button>
        </form>

        <aside className="h-max rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:sticky lg:top-24">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Order Summary</h2>
            <Link to="/cart" className="text-xs font-semibold text-[#0b2e59] hover:underline dark:text-blue-400">Edit cart</Link>
          </div>
          <div className="space-y-3">
            {checkoutItems.map((item) => {
              const snapshot = cartItems.find((c) => c.id === item.id)
              return (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-start gap-2">
                    <ProductThumb src={item.image} className="h-12 w-12" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium text-gray-800 dark:text-gray-100" title={item.name}>{item.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Qty {item.quantity} · PHP {formatPesos(item.price)} each</p>
                      {snapshot && toCentavos(snapshot.price) !== toCentavos(item.price) && (
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          Price updated from PHP {formatPesos(snapshot.price)}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="flex-shrink-0 font-semibold text-gray-800 dark:text-gray-100">PHP {formatPesos((toCentavos(item.price) * item.quantity) / 100)}</p>
                </div>
              )
            })}
            {checkoutItems.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No selected items for checkout.</p>
            )}
          </div>
          <div className="mt-4 space-y-1 border-t border-gray-200 pt-3 text-sm dark:text-gray-300">
            <div className="flex justify-between"><span>Subtotal</span><span>PHP {formatPesos(totals.subtotalCents / 100)}</span></div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>
                {checkoutItems.length === 0
                  ? '—'
                  : totals.shippingCents === 0
                    ? 'Free'
                    : `PHP ${formatPesos(totals.shippingCents / 100)}`}
              </span>
            </div>
            {shippingOpts?.freeThreshold != null && totals.subtotalCents > 0 && totals.subtotalCents < toCentavos(shippingOpts.freeThreshold) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Add PHP {formatPesos(shippingOpts.freeThreshold - totals.subtotalCents / 100)} more for free shipping.
              </p>
            )}
            {promoDiscount > 0 && (
              <div className="flex justify-between text-green-700 dark:text-green-300">
                <span>Promo discount{appliedPromo ? ` (${appliedPromo})` : ''}</span>
                <span>-PHP {formatPesos(promoDiscount)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between text-base font-bold text-[#0b2e59] dark:text-yellow-300">
              <span>Total</span>
              <span>PHP {formatPesos(Math.max(0, totals.totalCents / 100 - promoDiscount))}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default Checkout
