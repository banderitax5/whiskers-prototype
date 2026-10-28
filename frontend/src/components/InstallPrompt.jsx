import { useState, useEffect } from 'react'

// Small, dismissible card that offers to add the shop to the home screen (PWA).
// Chrome/Edge (desktop and Android) give a real one-tap install through the
// browser's beforeinstallprompt event. iPhone/iPad Safari has no install API, so
// it gets a short "Share, then Add to Home Screen" hint instead.
// Stays hidden until the shopper has answered the cookie banner, and never shows
// once the app is installed or the shopper said "Not now" in the last 30 days.

const COOKIE_KEY = 'whiskers_cookie_consent'
const DISMISS_KEY = 'whiskers_install_dismissed_at'
const DISMISS_DAYS = 30

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  )
}

function isIosSafari() {
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return iOS && safari
}

// Mac Safari (not iPhone/iPad). Chrome and Brave also contain "Safari" in their
// user agent, so they are excluded here.
function isMacSafari() {
  const ua = window.navigator.userAgent
  return /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Brave/.test(ua)
}

function recentlyDismissed() {
  const at = Number(localStorage.getItem(DISMISS_KEY))
  if (!at) return false
  return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [mode, setMode] = useState(null) // 'install' | 'ios' | null
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferred(e)
    }
    function onInstalled() {
      setVisible(false)
      setDeferred(null)
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // iOS never fires beforeinstallprompt, so it gets the Share hint directly.
    // Other browsers get the card with a menu hint; the Install button replaces
    // it only if the browser actually offers an install.
    setMode(isIosSafari() ? 'ios' : isMacSafari() ? 'mac' : 'desktop')

    // wait until the cookie banner has been answered so the two do not overlap,
    // then wait a few seconds so the card is not the first thing a shopper sees
    let timer
    const poll = setInterval(() => {
      if (!localStorage.getItem(COOKIE_KEY)) return
      clearInterval(poll)
      timer = setTimeout(() => setVisible(true), 4000)
    }, 1000)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(timer)
      clearInterval(poll)
    }
  }, [])

  // show the Chrome/Edge card once the browser has offered an install
  useEffect(() => {
    if (deferred && !isStandalone()) setMode('install')
  }, [deferred])

  if (!visible || !mode) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  async function install() {
    if (!deferred) return
    deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    if (choice.outcome === 'accepted') setVisible(false)
    else dismiss()
  }

  return (
    <div
      role="dialog"
      aria-label="Add Whiskers to your home screen"
      className="fixed bottom-4 left-3 sm:left-6 z-[9996] max-w-[18rem] sm:max-w-xs rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg p-3 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width="40" height="40" className="h-10 w-10 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add Whiskers to your home screen</p>
          {mode === 'install' && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Tap Install to open the shop in its own window.</p>
          )}
          {mode === 'ios' && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Tap the Share button, then &ldquo;Add to Home Screen&rdquo;.
            </p>
          )}
          {mode === 'mac' && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              In the menu bar, choose File, then &ldquo;Add to Dock&rdquo;.
            </p>
          )}
          {mode === 'desktop' && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Open the browser menu and look for Install or Add app.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
        >
          &times;
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Tap &ldquo;Not now&rdquo; and we won&rsquo;t show this again for at least 30 days.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg transition hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Not now
        </button>
        {mode === 'install' && (
          <button
            type="button"
            onClick={install}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#0b2e59] hover:bg-[#15407a] rounded-lg transition"
          >
            Install
          </button>
        )}
      </div>
    </div>
  )
}
