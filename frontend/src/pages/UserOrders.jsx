import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const STATUS_COLOR = {
  Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Shipped: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

function UserOrders() {
  const { session, pushNotification } = useShop()
  const location = useLocation()
  const newOrderId = location.state?.newOrderId

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/orders`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) throw new Error('Failed to load orders')
        const { items } = await res.json()
        if (!cancelled) setOrders(items || [])
      } catch (err) {
        if (!cancelled) pushNotification(err.message, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [session, pushNotification])

  // auto-expand the newly placed order
  useEffect(() => {
    if (newOrderId && orders.length > 0) {
      setExpanded(newOrderId)
    }
  }, [newOrderId, orders])

  function toggleExpand(orderId) {
    setExpanded((prev) => prev === orderId ? null : orderId)
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

      {orders.length === 0 ? (
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
              {/* order header — always visible */}
              <button
                type="button"
                onClick={() => toggleExpand(order.order_id)}
                className="w-full p-4 text-left flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    #{String(order.order_id).slice(0, 8).toUpperCase()}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {order.status}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-base font-bold text-[#0b2e59] dark:text-yellow-300">
                    PHP {Number(order.total_amount).toLocaleString()}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expanded === order.order_id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* expanded details */}
              {expanded === order.order_id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">Customer</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{order.customer_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">Phone</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{order.phone || 'N/A'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">Address</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{order.address || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">Payment Method</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-100 uppercase">{order.payment?.method || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">Payment Amount</p>
                      <p className="font-semibold text-[#0b2e59] dark:text-yellow-300">PHP {Number(order.payment?.amount || order.total_amount).toLocaleString()}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <Link
                        to={`/orders/${order.order_id}`}
                        className="inline-flex items-center justify-center w-full sm:w-auto px-4 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        View Confirmation &amp; Receipt
                      </Link>
                    </div>
                  </div>
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
