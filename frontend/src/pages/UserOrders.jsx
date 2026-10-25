import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { formatPesos } from '../lib/cartLogic'
import { awaitingGatewayPayment, orderCode } from '../lib/orderDoc'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const STATUS_COLOR = {
  Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Shipped: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

function seedDraft(order) {
  const draft = {}
  for (const item of order.items || []) {
    draft[item.prod_id] = { rating: 0, comments: '' }
  }
  for (const f of order.feedback || []) {
    if (draft[f.prod_id]) {
      draft[f.prod_id] = { rating: Number(f.rating) || 0, comments: f.comments || '' }
    }
  }
  return draft
}

function StarRating({ value, onChange, productName }) {
  return (
    <div className="flex items-center" role="group" aria-label={`Rating for ${productName}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={value === n}
          className="h-11 w-11 flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2e59] dark:focus-visible:ring-yellow-300"
        >
          <svg
            className={`w-5 h-5 transition-colors ${value >= n ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21.2l1.6-7L2 9.5l7.1-.6z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

function UserOrders() {
  const { session, pushNotification, addToCart } = useShop()
  const location = useLocation()
  const newOrderId = location.state?.newOrderId

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [savingOrder, setSavingOrder] = useState(null)
  const [reordering, setReordering] = useState(null)

  // re-adds every item from a past order to the cart
  // stock may have changed since purchase, so we check current stock first
  // and skip anything that is out of stock, telling the user what was left out
  async function buyAgain(order) {
    if (reordering) return
    setReordering(order.order_id)
    const items = (order.items || []).filter((item) => item.prod_id)

    // fetch current stock so we can skip out-of-stock items up front
    let stockById = {}
    try {
      const res = await fetch(`${API_BASE}/products?pageSize=500`)
      if (res.ok) {
        const { items: prods } = await res.json()
        for (const p of prods || []) stockById[p.prod_id] = Number(p.stock_quantity)
      }
    } catch { /* stock map stays empty; fall back to adding everything */ }

    const skipped = []
    let added = 0
    for (const item of items) {
      const stock = stockById[item.prod_id]
      // skip only when we positively know the item is out of stock
      if (Number.isFinite(stock) && stock <= 0) {
        skipped.push(item.name)
        continue
      }
      const qty = Number(item.quantity) || 1
      await addToCart(
        {
          id: item.prod_id,
          prod_id: item.prod_id,
          name: item.name,
          price: Number(item.subtotal) / Math.max(1, Number(item.quantity)),
          image: item.image || '',
        },
        Number.isFinite(stock) && stock > 0 ? Math.min(qty, stock) : qty,
        { notify: false }
      )
      added += 1
    }

    if (skipped.length > 0) {
      pushNotification(
        `${added} item${added === 1 ? '' : 's'} added. Out of stock, skipped: ${skipped.join(', ')}.`,
        'info'
      )
    } else {
      pushNotification(`${added} item${added === 1 ? '' : 's'} added to cart.`, 'success')
    }
    setReordering(null)
  }

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/orders`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) throw new Error('Could not load your orders.')
        const { items } = await res.json()
        if (cancelled) return
        const list = items || []
        setOrders(list)
        const seeded = {}
        for (const order of list) seeded[order.order_id] = seedDraft(order)
        setDrafts(seeded)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [session, reloadKey])

  // auto-expand the newly placed order
  useEffect(() => {
    if (newOrderId && orders.length > 0) {
      setExpanded(newOrderId)
    }
  }, [newOrderId, orders])

  function toggleExpand(orderId) {
    setExpanded((prev) => prev === orderId ? null : orderId)
  }

  function setDraftValue(orderId, prodId, patch) {
    setDrafts((prev) => {
      const order = prev[orderId] || {}
      const current = order[prodId] || { rating: 0, comments: '' }
      return { ...prev, [orderId]: { ...order, [prodId]: { ...current, ...patch } } }
    })
  }

  async function saveReviews(order) {
    const draft = drafts[order.order_id] || {}
    const items = Object.entries(draft)
      .filter(([, v]) => v.rating >= 1)
      .map(([prodId, v]) => ({ prodId, rating: Number(v.rating), comments: (v.comments || '').trim() }))
    if (items.length === 0) {
      pushNotification('Pick a star rating before saving.', 'error')
      return
    }
    setSavingOrder(order.order_id)
    try {
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId: order.order_id, items }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save your reviews.')
      }
      setOrders((prev) => prev.map((o) => {
        if (o.order_id !== order.order_id) return o
        const merged = (o.feedback || []).filter((f) => !items.some((it) => it.prod_id === f.prod_id))
        for (const it of items) merged.push({ prod_id: it.prodId, rating: it.rating, comments: it.comments })
        return { ...o, feedback: merged }
      }))
      pushNotification('Reviews saved', 'success')
    } catch (err) {
      pushNotification(err.message, 'error')
    } finally {
      setSavingOrder(null)
    }
  }

  if (loading) {
    return (
      <div className="lg:mx-auto lg:max-w-4xl py-5 sm:py-6">
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="lg:mx-auto lg:max-w-4xl py-5 sm:py-6">
      <h1 className="mb-4 text-2xl font-bold text-[#0b2e59] dark:text-white">My Orders</h1>

      {error ? (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center" role="alert">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center min-h-[44px] px-6 rounded-lg bg-[#0b2e59] text-white text-xs font-black uppercase tracking-widest hover:bg-[#15407a] transition"
          >
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          You haven't placed any orders yet.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <article
              key={order.order_id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
            >
              {/* order header - always visible */}
              <button
                type="button"
                onClick={() => toggleExpand(order.order_id)}
                aria-expanded={expanded === order.order_id}
                className="w-full p-4 text-left flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {orderCode(order.order_id)}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {order.status}
                  </span>
                  {awaitingGatewayPayment(order) && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      Awaiting payment
                    </span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-base font-bold text-[#0b2e59] dark:text-yellow-300">
                    PHP {formatPesos(Number(order.total_amount))}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${expanded === order.order_id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* expanded details */}
              {expanded === order.order_id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                  {(order.items || []).length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">Items</p>
                      <ul className="space-y-1.5">
                        {order.items.map((item, idx) => (
                          <li key={item.prod_id || idx} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-800 dark:text-gray-100 truncate">
                              {item.name} <span className="text-gray-500 dark:text-gray-400">x {item.quantity}</span>
                            </span>
                            <span className="text-gray-600 dark:text-gray-300 whitespace-nowrap">PHP {formatPesos(Number(item.subtotal))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Customer</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{order.customer_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Phone</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{order.phone || 'N/A'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Address</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{order.address || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Payment Method</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100 uppercase">{order.payment?.method || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Payment Amount</p>
                      <p className="font-semibold text-[#0b2e59] dark:text-yellow-300">PHP {formatPesos(Number(order.payment?.amount || order.total_amount))}</p>
                    </div>
                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                      {awaitingGatewayPayment(order) && (
                        <Link
                          to={`/pay/simulate?order=${order.order_id}`}
                          className="inline-flex items-center justify-center px-4 h-11 rounded-lg bg-[#0b2e59] text-sm font-semibold text-white hover:bg-[#15407a] transition-colors"
                        >
                          Complete payment
                        </Link>
                      )}
                      <Link
                        to={`/orders/${order.order_id}`}
                        className="inline-flex items-center justify-center px-4 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        View Confirmation
                      </Link>
                      <Link
                        to={`/receipt/${order.order_id}`}
                        className="inline-flex items-center justify-center px-4 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Receipt
                      </Link>
                      <button
                        type="button"
                        onClick={() => buyAgain(order)}
                        disabled={reordering === order.order_id || (order.items || []).length === 0}
                        className="inline-flex items-center justify-center px-4 h-11 rounded-lg bg-yellow-400 text-sm font-semibold text-gray-900 hover:bg-yellow-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {reordering === order.order_id ? 'Adding…' : 'Buy Again'}
                      </button>
                    </div>
                  </div>

                  {(order.items || []).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Your review</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Rate each product from this order. Reviews can be updated later.</p>
                      {order.items.map((item, idx) => {
                        if (!item.prod_id) return null
                        const value = drafts[order.order_id]?.[item.prod_id] || { rating: 0, comments: '' }
                        const saved = (order.feedback || []).some((f) => f.prod_id === item.prod_id)
                        return (
                          <div key={item.prod_id || idx} className="py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.name}</span>
                              <div className="flex items-center gap-2">
                                {saved && (
                                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px] font-bold uppercase tracking-wider">Saved</span>
                                )}
                                <StarRating
                                  value={value.rating}
                                  onChange={(n) => setDraftValue(order.order_id, item.prod_id, { rating: n })}
                                  productName={item.name}
                                />
                              </div>
                            </div>
                            <input
                              type="text"
                              value={value.comments}
                              onChange={(e) => setDraftValue(order.order_id, item.prod_id, { comments: e.target.value })}
                              maxLength={1000}
                              placeholder="Add a comment (optional)"
                              aria-label={`Comment for ${item.name}`}
                              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 h-11 focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-300"
                            />
                          </div>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => saveReviews(order)}
                        disabled={savingOrder === order.order_id}
                        className="mt-3 inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition disabled:opacity-40"
                      >
                        {savingOrder === order.order_id ? 'Saving...' : 'Save reviews'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default UserOrders
