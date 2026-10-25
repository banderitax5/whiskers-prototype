// Pure helpers for the lost-authenticator recovery flow. Kept out of the
// component file so React Fast Refresh stays happy when the component changes.

// Used when site settings have no contact_email yet (fresh install, or the
// owner has not filled it in). Admin Settings controls the real address.
export const SUPPORT_EMAIL_FALLBACK = 'shop@whiskerspet.me'

// Turns public contact details into working tel:/mailto: links.
export function contactLinks({ phone, email, accountEmail = '' }) {
  const dialable = String(phone || '').replace(/[^\d+]/g, '')
  const subject = 'Two-factor recovery request'
  const body = [
    'Hi Whiskers Pet Shop,',
    '',
    "I can't sign in because I lost access to my authenticator app.",
    '',
    `Account email: ${accountEmail}`,
    'Full name:',
    'Order number (if any):',
    'Phone number on file:',
  ].join('\n')

  return {
    telHref: dialable ? `tel:${dialable}` : '',
    mailtoHref: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}
