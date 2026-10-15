import { useEffect, useState } from 'react'
import { useShop } from '../context/ShopContext.jsx'
import { apiGetAuth, apiPostAuth } from '../lib/api'

const STATUS_REPLIED = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
const STATUS_WAITING = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Support() {
  const { session, pushNotification, openLogin } = useShop()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await apiGetAuth('/support', session.access_token)
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

  // guests can read this page but need an account to send or read messages -
  // show a clear sign-in prompt instead of an empty or broken thread
  if (!session) {
    return (
      <div className="lg:mx-auto lg:max-w-4xl py-5 sm:py-6">
        <h1 className="mb-1 text-2xl font-bold text-[#0b2e59] dark:text-white">Support</h1>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1 font-semibold">
            Sign in to contact our support team
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Messages and replies are tied to your account, so we can follow up with you here.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={openLogin}
              className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const data = await apiPostAuth('/support', { message: text }, session.access_token)
      setItems((prev) => [data.item, ...prev.filter((c) => c.support_id !== data.item.support_id)])
      setMessage('')
      pushNotification('Message sent. We will reply here.', 'success')
    } catch (err) {
      pushNotification(err.message || 'Could not send your message.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="lg:mx-auto lg:max-w-4xl py-5 sm:py-6">
      <h1 className="mb-1 text-2xl font-bold text-[#0b2e59] dark:text-white">Support</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Send us a message about an order or a product. Replies appear below. Each account keeps one thread: new messages are added above so the full conversation stays in one place.
      </p>

      <form onSubmit={submit} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm mb-6">
        <label htmlFor="support-message" className="block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">
          Your message
        </label>
        <textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Describe your question or concern..."
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm p-3 focus:outline-none focus:border-[#0b2e59] dark:focus:border-yellow-300 resize-y"
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-[11px] text-gray-500 dark:text-slate-400">{message.length}/2000</span>
          <button
            type="submit"
            disabled={!message.trim() || sending}
            className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg bg-[#0b2e59] dark:bg-yellow-400 text-white dark:text-gray-900 text-xs font-black uppercase tracking-widest hover:bg-[#15407a] dark:hover:bg-yellow-300 transition disabled:opacity-40"
          >
            {sending ? 'Sending...' : 'Send message'}
          </button>
        </div>
      </form>

      <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-2">
        Your messages
      </h2>

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-2">
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No messages yet. Ask us anything above and our replies will show up here.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <article key={c.support_id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${c.response ? STATUS_REPLIED : STATUS_WAITING}`}>
                  {c.response ? 'Replied' : 'Awaiting reply'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(c.date_submitted)}</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">{c.message}</p>
              {c.response && (
                <div className="mt-3 pl-3 border-l-2 border-yellow-400 dark:border-yellow-500">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1">Whiskers Petshop reply</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{c.response}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default Support
