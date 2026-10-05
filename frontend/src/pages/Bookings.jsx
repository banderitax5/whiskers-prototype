import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useShop } from '../context/ShopContext.jsx'
import { apiGetAuth, apiPatchAuth } from '../lib/api'
import { BsClipboardCheck, BsArrowClockwise } from 'react-icons/bs'

const STATUS_STYLES = {
  Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function Bookings() {
  const { session, pushNotification } = useShop()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [cancellingId, setCancellingId] = useState(null)

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await apiGetAuth('/bookings', session.access_token)
        if (!cancelled) setItems(data.items || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [session, reloadKey])

  async function cancelBooking(b) {
    if (cancellingId) return
    setCancellingId(b.booking_id)
    try {
      const data = await apiPatchAuth(`/bookings/${b.booking_id}`, {}, session.access_token)
      setItems((prev) => prev.map((x) => x.booking_id === b.booking_id ? { ...x, status: data.item.status } : x))
      pushNotification('Booking cancelled.', 'success')
    } catch (err) {
      pushNotification(err.message || 'Could not cancel this booking.', 'error')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="lg:mx-auto lg:max-w-4xl py-5 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-[#0b2e59] dark:text-white">My Bookings</h1>
        <Link
          to="/services"
          className="inline-flex items-center min-h-[40px] px-4 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition"
        >
          Book a service
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Every service you have requested, with its current status. Pending and approved bookings can be cancelled here.
      </p>

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-2">
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center min-h-[44px] px-6 rounded-lg bg-[#0b2e59] text-white text-xs font-black uppercase tracking-widest hover:bg-[#15407a] transition"
          >
            <BsArrowClockwise className="w-3.5 h-3.5 mr-2" /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          <BsClipboardCheck className="w-7 h-7 mx-auto mb-2 opacity-50" />
          You have no bookings yet.{' '}
          <Link to="/services" className="text-[#0b2e59] dark:text-yellow-300 font-semibold underline">Browse services</Link>{' '}
          to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <article key={b.booking_id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-gray-900 dark:text-slate-100">{b.service_name}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[b.status] || STATUS_STYLES.Cancelled}`}>
                  {b.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 space-y-1">
                <p><span className="font-semibold text-gray-700 dark:text-slate-300">Preferred date:</span> {formatDate(b.preferred_date)}</p>
                <p><span className="font-semibold text-gray-700 dark:text-slate-300">Requested:</span> {b.created_at ? new Date(b.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                {b.notes && <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-gray-700 dark:text-slate-300">Notes:</span> {b.notes}</p>}
              </div>
              {['Pending', 'Approved'].includes(b.status) && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#1e3a5f]/50">
                  <button
                    type="button"
                    onClick={() => cancelBooking(b)}
                    disabled={cancellingId === b.booking_id}
                    className="text-xs font-bold text-red-500 hover:text-red-600 disabled:opacity-50 min-h-[36px]"
                  >
                    {cancellingId === b.booking_id ? 'Cancelling...' : 'Cancel booking'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default Bookings
