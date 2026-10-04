import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { extractSizeLabel, getBaseName } from '../lib/productUtils.js'
import {
  fetchOrderById, peso, orderCode, trackingCode, formatOrderDateTime,
  etaWindow, CARRIER, paymentMethodLabel, summarize, paymentPill, fulfillmentPill, deliveryPill,
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
  const { session, pushNotification } = useShop()
  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="lg:mx-auto lg:max-w-7xl py-5 sm:py-6">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
          Order Confirmation and Receipt
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Thank you for shopping with Whiskers! Your order has been placed and is currently being processed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── left column ─────────────────────────────────── */}
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
            <Row label="Paid On">{formatOrderDateTime(order.payment?.payment_date || order.created_at)}</Row>
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

        {/* ── right column ────────────────────────────────── */}
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
              <span className="text-xs font-black uppercase tracking-widest text-gray-700 dark:text-blue-200">Total Paid</span>
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
            <BsDownload className="w-4 h-4" /> Get PDF Receipt
          </Link>

          {/* support */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-start gap-3 shadow-sm">
            <BsQuestionCircle className="w-5 h-5 shrink-0 text-yellow-500 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Need support with this order?</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Call us at 420-400-10 or visit our help center.</p>
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
