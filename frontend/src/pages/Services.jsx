import { useEffect, useState } from 'react'
import { useShop } from '../context/ShopContext.jsx'
import { apiGet, apiPostAuth } from '../lib/api'
import { BsClipboardCheck, BsClock, BsExclamationTriangle, BsArrowClockwise } from 'react-icons/bs'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatPrice(price) {
  const n = Number(price || 0)
  return `PHP ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function Services() {
  const { session, pushNotification } = useShop()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState(null)
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await apiGet('/services')
        if (!cancelled) setItems(data.items || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not reach the server.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadKey])

  useEffect(() => {
    if (!selected) return
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected])

  function startBooking(svc) {
    if (!session) {
      pushNotification('Sign in from the top navigation to book a service.', 'info')
      return
    }
    setSelected(svc)
    setDate(todayStr())
    setNotes('')
  }

  async function submit(e) {
    e.preventDefault()
    if (!session?.access_token || !selected || !date || submitting) return
    setSubmitting(true)
    try {
      await apiPostAuth('/bookings', {
        serviceId: selected.service_id,
        preferredDate: date,
        notes: notes.trim(),
      }, session.access_token)
      pushNotification('Booking requested. We will review it shortly.', 'success')
      setSelected(null)
    } catch (err) {
      pushNotification(err.message || 'Could not book this service.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lg:mx-auto lg:max-w-5xl py-5 sm:py-6">
      <h1 className="mb-1 text-2xl font-bold text-[#0b2e59] dark:text-white">Services &amp; Booking</h1>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        Grooming, veterinary visits, and other pet care services you can book in a few taps. Pick a service, choose a preferred date, and our team will confirm it.
      </p>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-3">
              <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
          No services are listed right now. Check back soon.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((svc) => (
            <article key={svc.service_id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">{svc.name}</h2>
                <span className="shrink-0 font-black text-[#0b2e59] dark:text-yellow-200">{formatPrice(svc.price)}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 flex-1">{svc.description || 'No description provided.'}</p>
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-[#1e3a5f]/50">
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                  <BsClock className="w-3.5 h-3.5" />
                  {svc.duration_minutes ? `${svc.duration_minutes} min` : 'Duration TBD'}
                </span>
                <button
                  type="button"
                  onClick={() => startBooking(svc)}
                  className="min-h-[44px] px-5 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition"
                >
                  Book now
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Book ${selected.name}`}
            className="bg-white dark:bg-[#0f2847] rounded-xl shadow-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#1e3a5f]">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Book {selected.name}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">{formatPrice(selected.price)}{selected.duration_minutes ? ` · ${selected.duration_minutes} min` : ''}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-[#1e3a5f] text-gray-500 dark:text-slate-400 transition" aria-label="Close booking dialog">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={submit}>
              <div className="p-4 space-y-4">
                <div>
                  <label htmlFor="booking-date" className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">Preferred date</label>
                  <input
                    id="booking-date"
                    type="date"
                    required
                    min={todayStr()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-900 dark:text-slate-100 text-sm p-3 focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-200"
                  />
                </div>
                <div>
                  <label htmlFor="booking-notes" className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">Notes (optional)</label>
                  <textarea
                    id="booking-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Anything we should know about your pet?"
                    className="w-full rounded-lg border border-gray-300 dark:border-[#1e3a5f] bg-white dark:bg-[#162d4a] text-gray-900 dark:text-slate-100 text-sm p-3 focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-200 resize-y"
                  />
                  <span className="block text-right text-[11px] text-gray-500 dark:text-slate-400 mt-1">{notes.length}/1000</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 flex items-start gap-1.5">
                  <BsExclamationTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Your booking starts as Pending. We will review it and send an update to your Bookings page.
                </p>
              </div>

              <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-[#1e3a5f]">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-300 dark:border-[#1e3a5f] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!date || submitting}
                  className="px-4 py-2 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition disabled:opacity-40 min-h-[40px]"
                >
                  {submitting ? 'Booking...' : 'Confirm booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Services
