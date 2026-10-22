import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { extractSizeLabel, getBaseName } from '../lib/productUtils.js'
import {
  fetchOrderById, peso, orderCode, trackingCode, formatOrderDate,
  etaWindow, CARRIER, paymentMethodLabel, summarize, paymentPill, deliveryPill,
} from '../lib/orderDoc.js'
import { BsArrowLeft, BsPrinter } from 'react-icons/bs'

const CARD_LABEL = 'text-[10px] font-black uppercase tracking-widest text-gray-500'
const ROW_LABEL = 'text-sm text-gray-500'
const ROW_VALUE = 'text-sm font-semibold text-gray-900 text-right'

function Pill({ label, className }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${className}`}>
      {label}
    </span>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-b-0">
      <span className={ROW_LABEL}>{label}</span>
      <span className={ROW_VALUE}>{children}</span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="mx-auto w-full max-w-[820px] p-4">
      <div className="h-16 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="h-96 bg-gray-200 rounded animate-pulse" />
    </div>
  )
}

function OfficialReceipt() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { session } = useShop()
  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

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

  if (state === 'loading') return <Skeleton />

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center max-w-md w-full">
          <p className="text-sm text-red-600 dark:text-red-300 mb-5" role="alert">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-[#0b2e59] hover:bg-[#15407a] text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
          >
            <BsArrowLeft /> Back to My Orders
          </button>
        </div>
      </div>
    )
  }

  const s = summarize(order)
  const pay = paymentPill(order)
  const delivery = deliveryPill(order.status)
  const today = formatOrderDate(new Date().toISOString())

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-5 sm:py-8 px-3 print:bg-white print:p-0">
      {/* toolbar — hidden when printing */}
      <div className="no-print mx-auto w-full max-w-[820px] flex items-center justify-between gap-3 mb-4 print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          <BsArrowLeft /> Back
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-[#0b2e59] hover:bg-[#15407a] text-white text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
          title="Print or save as PDF"
        >
          <BsPrinter className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      {/* the printable document */}
      <div className="receipt-doc mx-auto w-full max-w-[820px] bg-white shadow-xl print:shadow-none overflow-hidden">
        {/* header */}
        <div className="bg-[#0b2e59] text-white px-5 sm:px-7 py-4 flex items-center justify-between gap-4 print:bg-[#0b2e59]">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo/logo-whiskers.png" alt="Whiskers" className="h-9 shrink-0" />
            <span className="text-[9px] sm:text-[10px] tracking-[0.2em] text-blue-200 hidden sm:block">PREMIUM PET SUPPLIES</span>
          </div>
          <div className="text-right shrink-0">
            <h1 className="text-lg sm:text-xl font-black uppercase tracking-wide">Official Receipt</h1>
            <p className="text-[11px] text-blue-200">Printed on {today}</p>
          </div>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-5">
          {/* receipt for */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={CARD_LABEL}>Receipt For</p>
              <p className="text-lg font-black text-gray-900 mt-1">Order {orderCode(order.order_id)}</p>
              <p className="text-sm text-gray-500 mt-0.5">Date: {formatOrderDate(order.created_at)}</p>
            </div>
            <div className="flex items-start gap-6">
              <div>
                <p className={`${CARD_LABEL} mb-1 text-right`}>Payment Status</p>
                <div className="text-right"><Pill {...pay} /></div>
              </div>
              <div>
                <p className={`${CARD_LABEL} mb-1 text-right`}>Delivery Status</p>
                <div className="text-right"><Pill {...delivery} /></div>
              </div>
            </div>
          </div>

          {/* address + transaction details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-gray-100 pt-4">
            <div>
              <p className={`${CARD_LABEL} mb-2`}>Shipping Address</p>
              <p className="text-sm font-semibold text-gray-900">{order.address || 'N/A'}</p>
            </div>
            <div>
              <p className={`${CARD_LABEL} mb-2`}>Transaction Details</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500">Payment Method</span>
                  <span className="text-sm font-semibold text-gray-900">{paymentMethodLabel(order.payment?.method)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500">Phone Number</span>
                  <span className="text-sm font-semibold text-gray-900">{order.phone || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* order items */}
          <div className="border-t border-gray-100 pt-4">
            <p className={`${CARD_LABEL} mb-2`}>Order Items</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-500">
                    <th className="text-left font-black px-3 py-2.5">Item Details</th>
                    <th className="text-center font-black px-3 py-2.5 w-16">Qty</th>
                    <th className="text-right font-black px-3 py-2.5 w-28">Unit Price</th>
                    <th className="text-right font-black px-3 py-2.5 w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((item, i) => {
                    const unit = Number(item.subtotal) / Math.max(1, Number(item.quantity))
                    const size = extractSizeLabel(item.name)
                    return (
                      <tr key={i} className="border-b border-gray-100 last:border-b-0 align-top">
                        <td className="py-3 px-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 shrink-0 rounded border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                              {item.image
                                ? <img src={item.image} alt="" className="w-full h-full object-cover" />
                                : <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900">{getBaseName(item.name) || item.name}</p>
                              {size && <p className="text-xs text-gray-500">Size/Weight: {size}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center text-gray-700">{item.quantity}</td>
                        <td className="py-3 px-3 text-right text-gray-700">{peso(unit)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-gray-900">{peso(item.subtotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* tracking + payment summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className={`${CARD_LABEL} mb-2`}>Delivery &amp; Tracking</p>
                <Row label="Carrier">{CARRIER}</Row>
                <Row label="Estimated Delivery">{etaWindow(order.created_at)}</Row>
                <Row label="Tracking ID">
                  <span className="font-mono text-[#0039a6]">{trackingCode(order.order_id)}</span>
                </Row>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 flex items-start gap-3">
                <span className="w-5 h-5 shrink-0 rounded-full bg-yellow-400 text-gray-900 text-xs font-black flex items-center justify-center mt-0.5" aria-hidden="true">?</span>
                <div>
                  <p className="text-sm font-bold text-gray-900">Need support with this order?</p>
                  <p className="text-xs text-gray-500 mt-0.5">Call support at +63 912 345 6789 or email care@whiskerspets.com</p>
                </div>
              </div>
            </div>

            <div className="border-2 border-blue-600 rounded-lg p-4 self-start">
              <p className="text-sm font-black uppercase tracking-widest text-gray-900 mb-2">Payment Summary</p>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold text-gray-900">{peso(s.itemsSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-600">Shipping Fee</span>
                  <span className="font-semibold text-gray-900">{peso(s.shipping)}</span>
                </div>
                {s.discount && s.discount > 0 && (
                  <div className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-gray-600">Promo Discount</span>
                    <span className="font-semibold text-green-700 dark:text-green-300">-{peso(s.discount)}</span>
                  </div>
                )}
              </div>
              <div className="-mx-4 -mb-4 mt-3 px-4 py-3 rounded-b-md bg-blue-50 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-widest text-gray-700">Order Total</span>
                <span className="text-xl font-black text-blue-700">{peso(s.total)}</span>
              </div>
            </div>
          </div>

          {/* thank-you footer */}
          <div className="border-t border-gray-200 pt-5 text-center">
            <p className="text-base font-black text-gray-900">Thank you for shopping with Whiskers!</p>
            <p className="text-xs text-gray-500 mt-2 max-w-xl mx-auto leading-relaxed">
              Please retain this printable copy for your records. If you have any inquiries regarding your package
              contents or delivery schedule, refer to the tracking details provided above.
            </p>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-3 text-[11px] text-gray-500">
              <span>Whiskers Pet Supplies Co 2026</span>
              <span aria-hidden="true">•</span>
              <span>www.whiskerspets.com</span>
            </div>
          </div>
        </div>
      </div>

      {/* bottom link — hidden when printing */}
      <div className="no-print mx-auto w-full max-w-[820px] mt-4 text-center print:hidden">
        <Link
          to={`/orders/${order.order_id}`}
          className="inline-flex items-center min-h-[44px] px-4 text-sm font-semibold text-[#0039a6] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded"
        >
          ← Back to order confirmation
        </Link>
      </div>
    </div>
  )
}

export default OfficialReceipt
