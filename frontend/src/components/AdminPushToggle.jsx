// Bell button in the admin top bar: turns Web Push on or off for THIS device.
//
// One device = one subscription. A staff member on a phone and on a laptop can
// enable both; each gets its own notification. The setting lives in the browser
// (permission + subscription) and on the server (endpoint row), not in the
// account, which is why this is a device button and not a settings toggle.
//
// The button renders nothing when the browser cannot do push or the server has
// no VAPID keys, so it never becomes a dead control.
import { useCallback, useEffect, useState } from "react"
import { BsBell, BsBellFill } from "react-icons/bs"
import toast from "../lib/toast"
import {
  disablePush,
  enablePush,
  isSubscribed,
  onPushChange,
  pushConfig,
  pushSupport,
  sendTestPush,
} from "../lib/webPush"

export default function AdminPushToggle() {
  const [state, setState] = useState("loading") // loading | hidden | off | on | busy
  const [hint, setHint] = useState("")

  useEffect(() => {
    let alive = true
    async function refresh() {
      const support = pushSupport()
      if (support === "unsupported") {
        if (alive) setState("hidden")
        return
      }
      if (support === "needs_install") {
        if (alive) {
          setState("hidden")
          setHint("Add this site to your iPhone Home Screen to get order alerts.")
        }
        return
      }
      const config = await pushConfig()
      if (!config.enabled) {
        if (alive) setState("hidden")
        return
      }
      const subscribed = await isSubscribed()
      if (alive) setState(subscribed ? "on" : "off")
    }

    refresh()
    // the permission card can turn this on from another component on screen
    const stop = onPushChange(() => {
      if (alive) refresh()
    })
    return () => {
      alive = false
      stop()
    }
  }, [])

  const toggle = useCallback(async () => {
    if (state === "busy" || state === "loading" || state === "hidden") return
    setState("busy")
    if (state === "on") {
      const result = await disablePush()
      if (result.ok) {
        setState("off")
        toast.success("Order notifications are off for this device.")
      } else {
        setState("on")
        toast.error(result.reason)
      }
      return
    }

    const result = await enablePush()
    if (!result.ok) {
      setState("off")
      toast.error(result.reason)
      return
    }
    setState("on")
    toast.success("Order notifications are on for this device.")
    // Prove it immediately: the alert should land on the lock screen a second
    // later. A failure here is harmless, the subscription is already saved.
    void sendTestPush()
  }, [state])

  if (state === "hidden" || state === "loading") {
    // Keep the layout stable while the check runs.
    return <span className="h-10 w-10 shrink-0" aria-hidden="true" />
  }

  const on = state === "on"
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "busy"}
      aria-pressed={on}
      aria-label={on ? "Turn off order notifications on this device" : "Turn on order notifications on this device"}
      title={
        hint ||
        (on
          ? "Order notifications are ON for this device. Click to turn them off."
          : "Get a notification when a customer places an order.")
      }
      className={
        on
          ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-yellow-400 bg-yellow-50 text-[#0b2e59] hover:bg-yellow-100 disabled:opacity-60 dark:bg-yellow-400/20 dark:text-yellow-300 dark:hover:bg-yellow-400/30"
          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-60 dark:border-[#1e3a5f] dark:text-slate-300 dark:hover:bg-[#162d4a]"
      }
    >
      {on ? <BsBellFill className="h-4 w-4" /> : <BsBell className="h-4 w-4" />}
    </button>
  )
}
