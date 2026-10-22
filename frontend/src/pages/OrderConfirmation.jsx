import { useEffect, useState } from 'react'
import { Link, useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { apiPostAuth } from '../lib/api.js'
import { extractSizeLabel, getBaseName } from '../lib/productUtils.js'
import {
  fetchOrderById, peso, orderCode, trackingCode, formatOrderDateTime,
  etaWindow, CARRIER, paymentMethodLabel, summarize, paymentPill, fulfillmentPill, deliveryPill, isOnlinePayment,
  awaitingGatewayPayment,
} from '../lib/orderDoc.js'
import { BsArrowLeft, BsDownload, BsCopy, BsCheckLg, BsQuestionCircle } from 'react-icons/bs'

const CARD = 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-sm'
const CARD_TITLE = 'text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3'
const LABEL = 'text-sm text-gray-500 dark:text-gray-400'
const VALUE = 'text-sm font-semibold text-gray-900 dark:text-gray-100 text-right'

function Pill({ label, className }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${className}`}>
      {label}
    </span>
  )
}

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
    <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
      <div className="h-8 w-96 max-w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
      <div className="h-4 w-72 max-w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={CARD}>
              <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className={`${CARD} h-72`}>
          <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
        </div>
      </div>
    </div>
  )
}

function OrderConfirmation() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session, pushNotification } = useShop()
  // only the checkout that just placed the order passes this flag; the line
  // below never appears on a refresh or a later visit, so the page can never
  // claim a receipt was emailed when it was not
  const receiptEmailed = Boolean(location.state?.receiptEmailed)
  // set only when the pay page confirmed payment in this navigation
  const paymentSucceeded = Boolean(location.state?.paymentSucceeded)
  // PayMongo sends the shopper back here before its webhook lands
  const returnedFromPayMongo = searchParams.get('payment') === 'paymongo'
  const [confirming, setConfirming] = useState(returnedFromPayMongo)
  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false
    async function load() {
      setState('loading')
      setError('')
      try {
        const item = await fetchOrderById(orderId, session.access_token)
        if (!cancelled) { setOrder(item); setState('ready') }
      } catch (err) {
        if (!cancelled) {
          setError(err.status === 404 ? 'Order not found.' : err.message)
          setState('error')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [orderId, session])

  // The hosted gateway redirects back before its webhook is guaranteed to have
  // landed, so poll the order until the payment flips (or give up after ~1min).
  useEffect(() => {
    if (!confirming || !session?.access_token) return undefined
    let cancelled = false
    let attempts = 0
    let timer = null

    const poll = async () => {
      attempts += 1
      try {
        const item = await fetchOrderById(orderId, session.access_token)
        if (cancelled) return
        setOrder(item)
        setState('ready')
        if (String(item?.payment?.status || '').toLowerCase() === 'succeeded') {
          setConfirming(false)
          // drop the query flag so a refresh does not start polling again
          setSearchParams({}, { replace: true })
          return
        }
      } catch {
        // keep waiting - the webhook may still be in flight
      }
      if (attempts >= 20) {
        setConfirming(false)
        return
      }
      timer = setTimeout(poll, 3000)
    }

    timer = setTimeout(poll, 1500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [confirming, orderId, session, setSearchParams])

  async function resumePayment() {
    if (!session?.access_token || resuming) return
    setResuming(true)
    try {
      const data = await apiPostAuth(`/orders/${order.order_id}/payment-session`, {}, session.access_token)
      const url = data?.checkout_url
      if (!url) throw new Error('Could not start the payment session')
      if (/^https?:\/\//i.test(url)) window.location.assign(url)
      else navigate(url)
    } catch (err) {
      pushNotification(err.message || 'Could not start the payment session', 'error')
    } finally {
      setResuming(false)
    }
  }

  async function copyTracking() {
    try {
      await navigator.clipboard.writeText(trackingCode(order.order_id))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      pushNotification('Could not copy tracking ID', 'error')
    }
  }

  if (state === 'loading') return <Skeleton />

  if (state === 'error') {
    return (
      <div className="lg:mx-auto lg:max-w-4xl py-10 text-center">
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300 px-4 py-3 rounded-lg inline-block" role="alert">
          {error}
        </p>
        <div className="mt-5">
          <Link to="/orders" className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-[#0b2e59] hover:bg-[#15407a] text-white text-sm font-semibold transition-colors">
            <BsArrowLeft /> Back to My Orders
          </Link>
        </div>
      </div>
    )
  }

  const s = summarize(order)
  const pay = paymentPill(order)
  const fulfill = fulfillmentPill(order.status)
  const delivery = deliveryPill(order.status)
  const payStatus = String(order?.payment?.status || '').toLowerCase()

  return (
    <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
          Order Confirmation and Receipt
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Thank you for shopping with Whiskers! Your order has been placed and is currently being processed.
        </p>
        {(paymentSucceeded || (returnedFromPayMongo && payStatus === 'succeeded')) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300" role="status">
            <BsCheckLg className="mt-0.5 shrink-0" />
            <span>Payment confirmed â€” your order is now being processed.</span>
          </div>
        )}
        {receiptEmailed && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300" role="status">
            <BsCheckLg className="mt-0.5 shrink-0" />
            <span>A payment receipt has been emailed to your email address. You can also print or download the receipt below.</span>
          </div>
        )}
        {awaitingGatewayPayment(order) && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200" role="status">
            <div>
              <p className="font-semibold">
                {confirming
                  ? 'Confirming your paymentâ€¦'
                  : payStatus === 'failed'
                    ? 'Last payment attempt failed'
                    : 'Waiting for payment'}
              </p>
              <p className="text-xs mt-0.5">
                {confirming
                  ? 'This usually takes a few seconds. Keep this page open â€” your receipt follows by email.'
                  : payStatus === 'failed'
                    ? 'Your order is still pending â€” complete payment to confirm it.'
                    : 'Complete your payment to confirm this order.'}
                {!confirming && ' Unpaid orders are cancelled automatically after the payment window and items return to stock.'}
              </p>
            </div>
            {!confirming && (
              <button
                type="button"
                onClick={resumePayment}
                disabled={resuming}
                className="shrink-0 inline-flex items-center justify-center min-h-[40px] rounded-lg bg-[#0b2e59] px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-[#15407a] transition-colors disabled:opacity-60"
              >
                {resuming ? 'Openingâ€¦' : 'Complete payment'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* â”€â”€ left column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="space-y-4">
          {/* Order Overview */}
          <section className={CARD}>
            <h2 className={CARD_TITLE}>Order Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <Row label="Order Number">
                <span className="font-mono">{orderCode(order.order_id)}</span>
              </Row>
              <Row label="Payment Status"><Pill {...pay} /></Row>
              <Row label="Order Date">{formatOrderDateTime(order.created_at)}</Row>
              <Row label="Fulfillment Status"><Pill {...fulfill} /></Row>
            </div>
          </section>

          {/* Customer & Shipping Details */}
          <section className={CARD}>
            <h2 className={CARD_TITLE}>Customer &amp; Shipping Details</h2>
            <Row label="Shipping Address">{order.address || 'N/A'}</Row>
            {/* only a real settlement shows a paid timestamp (paid_at from the
                gateway, payment_date as fallback) - an unpaid online order
                never claims a Paid On */}
            {isOnlinePayment(order) && payStatus === 'succeeded' && (
              <Row label="Paid On">{formatOrderDateTime(order.payment?.paid_at || order.payment?.payment_date || order.created_at)}</Row>
            )}
            <Row label="Payment Method">{paymentMethodLabel(order.payment?.method)}</Row>
            <Row label="Phone Number">{order.phone || 'N/A'}</Row>
          </section>

          {/* Order Items */}
          <section className={CARD}>
            <h2 className={CARD_TITLE}>Order Items</h2>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left font-black pb-2">Item Details</th>
                    <th className="text-center font-black pb-2 w-16">Qty</th>
                    <th className="text-right font-black pb-2 w-28">Unit Price</th>
                    <th className="text-right font-black pb-2 w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((item, i) => {
                    const unit = Number(item.subtotal) / Math.max(1, Number(item.quantity))
                    const size = extractSizeLabel(item.name)
                    return (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0 align-top">
                        <td className="py-3 pr-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 shrink-0 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
                              {item.image
                                ? <img src={item.image} alt="" className="w-full h-full object-cover" />
                                : <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">{getBaseName(item.name) || item.name}</p>
                              {size && <p className="text-xs text-gray-500 dark:text-gray-400">Size/Weight: {size}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center text-gray-700 dark:text-gray-300">{item.quantity}</td>
                        <td className="py-3 text-right text-gray-700 dark:text-gray-300">{peso(unit)}</td>
                        <td className="py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{peso(item.subtotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Delivery & Tracking */}
          <section className={CARD}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`${CARD_TITLE} mb-0`}>Delivery &amp; Tracking</h2>
              <Pill {...delivery} />
            </div>
            <Row label="Carrier">{CARRIER}</Row>
            <Row label="Estimated Delivery">{etaWindow(order.created_at)}</Row>
            <Row label="Tracking ID">
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[#0039a6] dark:text-blue-300">{trackingCode(order.order_id)}</span>
                <button
                  type="button"
                  onClick={copyTracking}
                  className="p-1 rounded text-gray-400 hover:text-[#0039a6] dark:hover:text-blue-300 transition-colors"
                  title="Copy tracking ID"
                  aria-label="Copy tracking ID"
                >
                  {copied ? <BsCheckLg className="w-3.5 h-3.5 text-green-600" /> : <BsCopy className="w-3.5 h-3.5" />}
                </button>
              </span>
            </Row>
          </section>
        </div>

        {/* â”€â”€ right column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Payment Summary */}
          <section className="rounded-xl border-2 border-blue-600 dark:border-blue-500 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-sm">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3">Payment Summary</h2>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-600 dark:text-gray-300">Subtotal</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{peso(s.itemsSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-600 dark:text-gray-300">Shipping Fee</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{peso(s.shipping)}</span>
              </div>
            </div>
            <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-3 px-4 sm:px-5 py-4 rounded-b-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-gray-700 dark:text-blue-200">Order Total</span>
              <span className="text-2xl font-black text-blue-700 dark:text-blue-300">{peso(s.total)}</span>
            </div>
          </section>

          {/* actions */}
          <Link
            to="/"
            className="flex items-center justify-center w-full h-11 rounded-full bg-[#0b2e59] hover:bg-[#15407a] text-white text-sm font-semibold transition-colors"
          >
            Back to Home
          </Link>
          <Link
            to={`/receipt/${order.order_id}`}
            className="flex items-center justify-center gap-2 w-full h-11 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <BsDownload className="w-4 h-4" /> Print / Save Receipt
          </Link>

          {/* support */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-start gap-3 shadow-sm">
            <BsQuestionCircle className="w-5 h-5 shrink-0 text-yellow-500 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Need support with this order?</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Call us at <a href="tel:+639123456789" className="font-semibold hover:underline">+63 912 345 6789</a> or <Link to="/support" className="font-semibold text-[#0b2e59] dark:text-yellow-300 hover:underline">visit our help center</Link>.
              </p>
            </div>
          </div>

          <Link
            to="/orders"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-full text-gray-600 dark:text-gray-300 text-sm font-semibold hover:text-[#0b2e59] dark:hover:text-white transition-colors"
          >
            <BsArrowLeft className="w-4 h-4" /> Back to My Orders
          </Link>
        </aside>
      </div>
    </div>
  )
}

export default OrderConfirmation
