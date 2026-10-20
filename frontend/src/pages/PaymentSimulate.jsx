import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { fetchOrderById, paymentMethodLabel, isOnlinePayment, orderCode, peso, summarize } from '../lib/orderDoc.js'
import { trackEvent } from '../lib/appEvents.js'
import { BsCheckLg, BsShieldLock, BsArrowLeft, BsExclamationTriangle } from 'react-icons/bs'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const CARD = 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-sm'
const LABEL = 'text-sm text-gray-500 dark:text-gray-400'
const VALUE = 'text-sm font-semibold text-gray-900 dark:text-gray-100 text-right'

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{children}</span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="lg:mx-auto lg:max-w-2xl py-6 sm:py-8">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
      <div className={`${CARD} space-y-3`}>
        <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    </div>
  )
}

// pay page for the simulated gateway: stands in for PayMongo's hosted
// checkout. Success confirms the order (receipt + cart clear + Processing);
// failure keeps it Pending for a retry; leaving the page starts the TTL
// countdown that cancels the order and returns the stock.
function PaymentSimulate() {
  const [searchParams] = useSearchParams()
  const orderId = (searchParams.get('order') || '').trim()
  const navigate = useNavigate()
  const { session, pushNotification, clearCart } = useShop()

  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // 'success' | 'fail' | null
  const [failMsg, setFailMsg] = useState('')
  const [blocked, setBlocked] = useState('')
  const redirectedRef = useRef(false)

  useEffect(() => {
    if (!session?.access_token) return
    if (!orderId || !/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
      setError('Missing or invalid order reference.')
      setState('error')
      return
    }
    let cancelled = false
    async function load() {
      setState('loading')
      setError('')
      try {
        const item = await fetchOrderById(orderId, session.access_token)
        if (!cancelled) {
          setOrder(item)
          setState('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.status === 404 ? 'Order not found.' : err.message || 'Could not load this order.')
          setState('error')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [orderId, session])

  // already paid -> straight to the confirmation page (the fresh fetch there
  // shows the PAID pill and the receipt)
  useEffect(() => {
    if (state !== 'ready' || !order || redirectedRef.current) return
    const paid = String(order.payment?.status || '').toLowerCase() === 'succeeded'
    if (paid) {
      redirectedRef.current = true
      navigate(`/orders/${order.order_id}`, { replace: true })
    }
  }, [state, order, navigate])

  async function confirm(result) {
    if (busy || !order) return
    setBusy(result)
    if (result === 'fail') setFailMsg('')
    try {
      const res = await fetch(`${API_BASE}/orders/${order.order_id}/simulate-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ result }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) {
          // expired or cancelled under us - close the page honestly
          setBlocked(data.error || 'This order is no longer payable.')
          pushNotification(data.error || 'This order is no longer payable.', 'error')
          return
        }
        throw new Error(data.error || 'Could not reach the payment service')
      }

      if (result === 'fail') {
        setFailMsg('The payment did not go through (simulated). Your order is still pending — you can try again now or finish paying later from My Orders.')
        setOrder((prev) => (prev ? { ...prev, payment: { ...prev.payment, status: 'failed' } } : prev))
        return
      }

      // success: the server already cleared the cart rows; this finishes the
      // local state so the cart page cannot show items that no longer exist
      const ids = Array.isArray(data.product_ids) ? data.product_ids : []
      if (ids.length > 0) clearCart(ids, { immediate: true })
      try { sessionStorage.removeItem('whiskers.cart.selectedIds') } catch { /* ignore */ }
      trackEvent('checkout_complete', {
        order_id: order.order_id,
        total: Number(order.total_amount) || 0,
        items: (order.items || []).length,
      })
      pushNotification('Payment confirmed! Your order is being processed.', 'success')
      navigate(`/orders/${order.order_id}`, {
        replace: true,
        state: { paymentSucceeded: true, receiptEmailed: Boolean(data.receipt_email_sent) },
      })
    } catch (err) {
      pushNotification(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (state === 'loading') return <Skeleton />

  if (state === 'error') {
    return (
      <div className="lg:mx-auto lg:max-w-2xl py-10 text-center">
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300 px-4 py-3 rounded-lg inline-block" role="alert">
          {error}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-[#0b2e59] hover:bg-[#15407a] text-white text-sm font-semibold transition-colors">
            <BsArrowLeft /> Back to shop
          </Link>
          <Link to="/orders" className="inline-flex items-center h-11 px-5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            My Orders
          </Link>
        </div>
      </div>
    )
  }

  const s = summarize(order)
  const methodLabel = paymentMethodLabel(order.payment?.method)
  const payStatus = String(order.payment?.status || '').toLowerCase()

  // closed for business: expired / cancelled / not an online order
  if (blocked || order.status === 'Cancelled' || !isOnlinePayment(order)) {
    let closedTitle
    let closedBody = ''
    if (blocked) {
      closedTitle = blocked
    } else if (order.status === 'Cancelled') {
      closedTitle = 'This order was cancelled or its payment window expired.'
      closedBody = 'The reserved items were returned to stock. Place a new order to continue shopping.'
    } else {
      closedTitle = 'This order does not need online payment.'
      closedBody = 'Open the order page to view its details.'
    }
    return (
      <div className="lg:mx-auto lg:max-w-2xl py-8 sm:py-12">
        <div className={`${CARD} text-center`}>
          <BsExclamationTriangle className="mx-auto w-8 h-8 text-amber-500 mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Payment closed</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{closedTitle}</p>
          {closedBody && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{closedBody}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link to="/menu" className="inline-flex items-center min-h-[44px] px-6 rounded-lg bg-[#0b2e59] text-white text-sm font-semibold hover:bg-[#15407a] transition-colors">
              Continue shopping
            </Link>
            <Link to="/orders" className="inline-flex items-center min-h-[44px] px-6 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              My Orders
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lg:mx-auto lg:max-w-2xl py-6 sm:py-8">
      <div className="mb-4 flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <BsShieldLock className="w-4 h-4" aria-hidden="true" />
        <span className="text-[10px] font-black uppercase tracking-widest">Secure checkout</span>
      </div>
      <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-1">Payment</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Confirm the payment below to complete your order.
      </p>

      {/* honest about what this page is - the panel will see it too */}
      <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
        <span className="font-bold">Simulated gateway</span> — this walkthrough demonstrates the automated cashless flow end to end; no real money moves. In production this step is PayMongo&apos;s hosted checkout page.
      </div>

      {failMsg && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-3 py-2.5 text-sm text-red-800 dark:text-red-200">
          {failMsg}
        </div>
      )}

      <section className={CARD} aria-label="Order summary">
        <Row label="Order"><span className="font-mono">{orderCode(order.order_id)}</span></Row>
        <Row label="Method">{methodLabel}</Row>
        <Row label="Items">
          {(order.items || []).length} product{(order.items || []).length === 1 ? '' : 's'}
        </Row>
        <Row label="Total"><span className="text-base font-black text-[#0b2e59] dark:text-yellow-300">{peso(s.total)}</span></Row>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Your items are reserved while you pay. If you leave without paying, the order is cancelled automatically after the payment window and the items return to stock.
          {payStatus === 'failed' && <span className="font-semibold text-red-600 dark:text-red-400"> Your last attempt failed — you can try again.</span>}
        </p>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => confirm('success')}
          disabled={Boolean(busy)}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg bg-green-600 hover:bg-green-700 px-5 text-sm font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <BsCheckLg className="w-4 h-4" aria-hidden="true" />
          {busy === 'success' ? 'Confirming…' : 'Payment successful'}
        </button>
        <button
          type="button"
          onClick={() => confirm('fail')}
          disabled={Boolean(busy)}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy === 'fail' ? 'Recording…' : 'Payment failed'}
        </button>
      </div>
      <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
        <strong>Payment successful</strong> confirms the order, emails your receipt and clears your cart.
        {' '}<strong>Payment failed</strong> keeps the order pending so you can retry.
      </p>

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link to="/menu" className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-[#0b2e59] dark:hover:text-white transition-colors">
          <BsArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Leave and keep browsing
        </Link>
        <Link to="/orders" className="text-gray-500 dark:text-gray-400 hover:text-[#0b2e59] dark:hover:text-white transition-colors">
          My Orders
        </Link>
      </div>
    </div>
  )
}

export default PaymentSimulate
