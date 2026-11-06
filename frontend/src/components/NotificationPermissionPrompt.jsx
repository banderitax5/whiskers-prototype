// Soft-ask modal for Web Push permission.
//
// Until now the only way to turn alerts on was the bell / Profile row, and a
// shopper had to find it themselves (or dig through browser site settings).
// This card asks once, explains why, and then triggers the browser's own
// permission box from the Allow button. The browser only shows that box while
// a real tap is in progress, which is why the click handler calls enablePush()
// directly - enablePush() starts the request before any network call.
//
// It never asks on its own: it only renders for a signed-in account, when the
// browser and server can actually deliver push, and when the browser has not
// answered yet. A "Not now", or an Allow that ends in "blocked", is remembered
// for 30 days so the card does not nag. Once permission is denied only the
// browser's site settings can undo it, so the card stays out of the way.
// Guests have no account to attach a subscription to, so they never see it.
import { useEffect, useState } from "react"
import { BsBell } from "react-icons/bs"
import toast from "../lib/toast"
import { useShop } from "../context/ShopContext.jsx"
import { enablePush, pushConfig, pushSupport, sendTestPush } from "../lib/webPush"

const DISMISS_KEY = "whiskers_push_prompt_dismissed_at"
const ASK_AGAIN_DAYS = 30
// Let the page settle first: the card should not be the first thing a shopper
// sees after signing in.
const SHOW_DELAY_MS = 3000

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Boolean(at) && Date.now() - at < ASK_AGAIN_DAYS * 24 * 60 * 60 * 1000
  } catch {
    // storage can be unavailable (private mode); asking again is harmless
    return true
  }
}

function rememberAnswer() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // the browser's own permission still governs what happens next
  }
}

function browserPermission() {
  if (typeof Notification === "undefined") return "unsupported"
  return Notification.permission
}

export default function NotificationPermissionPrompt({ variant = "customer" }) {
  const { session } = useShop()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    if (browserPermission() !== "default") return
    if (recentlyDismissed()) return
    if (pushSupport() !== "ok") return

    let alive = true
    let timer
    ;(async () => {
      const config = await pushConfig()
      if (!alive || !config.enabled) return
      timer = setTimeout(() => {
        if (alive) setVisible(true)
      }, SHOW_DELAY_MS)
    })()

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [session])

  if (!visible) return null

  const staff = variant === "staff"

  async function allow() {
    if (busy) return
    setBusy(true)
    // enablePush asks the browser first, then subscribes and saves the device.
    const result = await enablePush()
    // Any answer counts as asked: if the shopper waves away the browser's own
    // box, the card should not pop up again tomorrow and ask the same thing.
    rememberAnswer()
    setVisible(false)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.reason)
      return
    }
    toast.success("Order notifications are on for this device.")
    // Prove it immediately, the same way the bell and the Profile row do.
    void sendTestPush()
  }

  function notNow() {
    rememberAnswer()
    setVisible(false)
  }

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!busy) notNow()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-prompt-title"
        aria-describedby="push-prompt-body"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <BsBell className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 id="push-prompt-title" className="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            {staff ? "Get alerted to new orders?" : "Get alerts about your orders?"}
          </h3>
          <p id="push-prompt-body" className="text-sm text-gray-600 dark:text-gray-400">
            {staff
              ? "Whiskers can notify this device when a customer places an order, even when the tab is closed."
              : "Whiskers can notify this device when your order is processing, shipped, delivered or cancelled."}{" "}
            Your browser will ask you to Allow next. You can turn this off any time.
          </p>
        </div>
        <div className="flex border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={notNow}
            disabled={busy}
            className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={allow}
            disabled={busy}
            autoFocus
            className="flex-1 border-l border-gray-200 px-4 py-3 text-sm font-medium text-white transition bg-[#0b2e59] hover:bg-[#15407a] disabled:opacity-60 dark:border-gray-700"
          >
            {busy ? "Please wait…" : "Allow notifications"}
          </button>
        </div>
      </div>
    </div>
  )
}
