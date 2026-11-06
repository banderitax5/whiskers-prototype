// "Order notifications" row on the Profile page (customer side).
//
// Same channel the admin bell uses, opposite direction: a shopper who opts in
// gets a system notification when their own order changes status. A guest has
// no account, so there is nothing to attach a subscription to - the row only
// renders for a signed-in user.
//
// Renders nothing when the browser or the server cannot do push, so it never
// becomes a dead control.
import { useCallback, useEffect, useState } from "react"
import { BsBell, BsBellFill } from "react-icons/bs"
import toast from "../lib/toast"
import { disablePush, enablePush, isSubscribed, pushConfig, pushSupport, sendTestPush } from "../lib/webPush"

export default function OrderNotificationToggle() {
  const [state, setState] = useState("loading") // loading | hidden | off | on | busy
  const [hint, setHint] = useState("")

  useEffect(() => {
    let alive = true
    ;(async () => {
      const support = pushSupport()
      if (support === "unsupported") {
        if (alive) setState("hidden")
        return
      }
      if (support === "needs_install") {
        if (alive) {
          setState("hidden")
          setHint("Add this site to your iPhone Home Screen, then open it from there to turn alerts on.")
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
    })()
    return () => {
      alive = false
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
    void sendTestPush()
  }, [state])

  if (state === "hidden" || state === "loading") return null

  const on = state === "on"
  return (
    <section className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Order notifications
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-300">
        {hint ||
          "Get an alert on this device when your order is processing, shipped, delivered or cancelled. You can turn it off any time."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            on
              ? "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-green-500" : "bg-gray-400"}`} aria-hidden="true" />
          {on ? "On" : "Off"}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={state === "busy"}
          aria-pressed={on}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 sm:text-sm"
        >
          {on ? <BsBellFill className="h-3.5 w-3.5" /> : <BsBell className="h-3.5 w-3.5" />}
          {state === "busy" ? "Please wait…" : on ? "Turn off on this device" : "Turn on for this device"}
        </button>
      </div>
    </section>
  )
}
