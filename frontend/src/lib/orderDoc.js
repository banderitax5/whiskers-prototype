// shared helpers for the order confirmation page and the printable receipt

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export function peso(amount) {
  const n = Number(amount) || 0
  return `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// display code used across both documents, e.g. #WPS-894201
export function orderCode(orderId) {
  return `#WPS-${String(orderId ?? '').slice(0, 6).toUpperCase()}`
}

// display-only tracking id, e.g. TRK-WPS-894201
export function trackingCode(orderId) {
  return `TRK-${String(orderId ?? '').slice(0, 8).toUpperCase()}`
}

export function formatOrderDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatOrderDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${formatOrderDate(iso)} | ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
}

export function formatShortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// display-only delivery window: order date +2 to +5 business days
// matches the FAQ promise on the About page
export function etaWindow(iso) {
  if (!iso) return ''
  const start = new Date(iso)
  start.setDate(start.getDate() + 2)
  const end = new Date(iso)
  end.setDate(end.getDate() + 5)
  return `${formatShortDate(start)} – ${formatShortDate(end)}`
}

export const CARRIER = 'Whiskers Express'

export function paymentMethodLabel(method) {
  if (!method) return 'N/A'
  const map = { cod: 'COD (Cash on Delivery)', gcash: 'GCash', paymaya: 'PayMaya' }
  return map[String(method).toLowerCase()] || String(method).toUpperCase()
}

// derives the payment summary rows from the persisted order
export function summarize(order) {
  const itemsSubtotal = (order?.items || []).reduce((sum, i) => sum + Number(i.subtotal || 0), 0)
  const total = Number(order?.payment?.amount || order?.total_amount || 0)
  const shipping = Math.max(0, Number(order?.total_amount || 0) - itemsSubtotal)
  return { itemsSubtotal, shipping, total }
}

// pill styles shared by both documents (label, tailwind classes)
// the backend inserts a payment row at order time for every method, so the
// row existing does NOT mean money was received. Be honest about the state:
// COD is collected on delivery; online methods record intent, not settlement.
export function paymentPill(order) {
  const method = String(order?.payment?.method || '').toLowerCase()
  if (method === 'cod') {
    return { label: 'PAY ON DELIVERY', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' }
  }
  if (order?.payment) {
    return { label: 'PAYMENT PENDING', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' }
  }
  return { label: 'UNPAID', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
}

// true only when money is actually expected up front (online methods)
export function isOnlinePayment(order) {
  const method = String(order?.payment?.method || '').toLowerCase()
  return method === 'gcash' || method === 'paymaya'
}

export function fulfillmentPill(status) {
  const map = {
    Pending: { label: 'PENDING', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
    Processing: { label: 'PROCESSING', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    Shipped: { label: 'SHIPPED', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
    Delivered: { label: 'DELIVERED', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    Cancelled: { label: 'CANCELLED', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }
  return map[status] || { label: String(status || 'UNKNOWN').toUpperCase(), className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
}

export function deliveryPill(status) {
  const map = {
    Pending: { label: 'PREPARING', className: 'bg-[#0039a6] text-white' },
    Processing: { label: 'PROCESSING', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    Shipped: { label: 'IN TRANSIT', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    Delivered: { label: 'DELIVERED', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    Cancelled: { label: 'CANCELLED', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }
  return map[status] || { label: 'UNKNOWN', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
}

// fetches a single order, throws an Error with .status on failure
export async function fetchOrderById(orderId, token) {
  const res = await fetch(`${API_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data.item
}
