import { useEffect, useId, useState } from 'react'
import {
  fetchSiteContent,
  contentSettings,
  CLIENT_DEFAULT_SETTINGS,
} from '../lib/siteContent.js'
import { contactLinks, SUPPORT_EMAIL_FALLBACK } from '../lib/mfaRecovery.js'

function useContactDetails(active) {
  const [details, setDetails] = useState(() => ({
    phone: CLIENT_DEFAULT_SETTINGS.contact_phone,
    email: CLIENT_DEFAULT_SETTINGS.contact_email || SUPPORT_EMAIL_FALLBACK,
  }))

  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetchSiteContent()
      .then((content) => {
        if (cancelled) return
        const s = contentSettings(content)
        setDetails({
          phone: String(s.contact_phone || '').trim() || CLIENT_DEFAULT_SETTINGS.contact_phone,
          email: String(s.contact_email || '').trim() || SUPPORT_EMAIL_FALLBACK,
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [active])

  return details
}

// The instructions + contact actions. `active` gates the settings fetch so a
// collapsed disclosure on the login modal makes no request until it is opened.
export function LostAuthenticatorContent({ email = '', active = true, id }) {
  const { phone, email: shopEmail } = useContactDetails(active)
  const { telHref, mailtoHref } = contactLinks({ phone, email: shopEmail, accountEmail: email })

  return (
    <div id={id} className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
      <p>
        For your security, only the shop can remove two-factor authentication from an account.
        We&apos;ll verify it&apos;s really you first.
      </p>

      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-100">Have this ready</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>The email address on the account{email ? ` (${email})` : ''}</li>
          <li>Your full name</li>
          <li>An order number, if you have ordered before</li>
          <li>The mobile number saved on the account</li>
        </ul>
      </div>

      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-100">What happens next</p>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>We check your details.</li>
          <li>We remove the authenticator requirement from the account.</li>
          <li>You sign in with your password and change it.</li>
          <li>You turn two-factor authentication back on with your new phone.</li>
        </ol>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Still signed in on a laptop or tablet? Open <strong>Profile &rarr; Two-factor authentication</strong>
        and turn it off there, then set it up again on your new phone.
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {telHref && (
          <a
            href={telHref}
            className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg bg-[#0b2e59] text-white text-xs font-black uppercase tracking-widest hover:bg-[#15407a] transition dark:bg-yellow-400 dark:text-gray-900 dark:hover:bg-yellow-300"
          >
            Call the shop
          </a>
        )}
        <a
          href={mailtoHref}
          className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg border border-gray-300 dark:border-[#2c4a6f] text-gray-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-[#1e3a5f] transition"
        >
          Email the shop
        </a>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Please never send your password or authenticator codes by email.
      </p>
    </div>
  )
}

// Collapsible disclosure used inside the MFA challenge windows. It never
// navigates away, so a half-finished sign-in (pending aal1 session) survives.
export function LostAuthenticatorHelp({ email = '', className = '' }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="text-xs sm:text-sm font-semibold text-[#0039a6] hover:text-[#0046cc] underline-offset-2 hover:underline dark:text-yellow-300 dark:hover:text-yellow-200 transition-colors"
      >
        Lost access to your authenticator app?
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-left"
      >
        <LostAuthenticatorContent email={email} active={open} />
        <p className="mt-3 text-xs">
          <a
            href="/help/lost-authenticator"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#0039a6] hover:text-[#0046cc] underline-offset-2 hover:underline dark:text-yellow-300 dark:hover:text-yellow-200"
          >
            Open this help in a new tab
          </a>
        </p>
      </div>
    </div>
  )
}

export default LostAuthenticatorHelp
