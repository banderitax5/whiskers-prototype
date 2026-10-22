import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { fetchSiteContent, contentNav, contentSettings } from "../lib/siteContent.js"

const LINK_CLASS = "text-gray-600 hover:text-[#0b2e59] dark:text-gray-400 dark:hover:text-white transition-colors duration-200 cursor-pointer"

function Footer() {
  const [content, setContent] = useState(null)

  // footer link groups come from the content tables when seeded; the
  // built-in groups below render on a fresh install until then
  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((data) => { if (!cancelled) setContent(data) })
    return () => { cancelled = true }
  }, [])

  const shopLinks = contentNav(content, "footer_shop") || [
    { id: "dogs", label: "Dog", href: "/menu?category=Dogs" },
    { id: "cats", label: "Cat", href: "/menu?category=Cats" },
    { id: "birds", label: "Bird", href: "/menu?category=Birds" },
    { id: "small", label: "Small Pet", href: "/menu?category=Small Pets" },
  ]
  const accountLinks = contentNav(content, "footer_account") || [
    { id: "profile", label: "My Account", href: "/profile" },
    { id: "orders", label: "Orders", href: "/orders" },
    { id: "about", label: "FAQs", href: "/about" },
  ]
  const socialLinks = contentNav(content, "footer_social") || [
    { id: "instagram", label: "Instagram", href: "https://www.instagram.com/petcareswhiskers?igsh=aTN5NXN3Mm5nbXV1&utm_source=qr" },
    { id: "facebook", label: "Facebook", href: "https://facebook.com/profile.php?id=61561539844519" },
  ]

  // contact block from site settings (Phase 6); the built-in values match
  // what this footer showed before the settings existed
  const settings = contentSettings(content)
  const contactRows = [
    settings.contact_phone && { id: "phone", label: settings.contact_phone, href: `tel:${settings.contact_phone.replace(/[^+\d]/g, "")}` },
    settings.contact_email && { id: "email", label: settings.contact_email, href: `mailto:${settings.contact_email}` },
    settings.contact_address && { id: "address", label: settings.contact_address },
    settings.store_hours && { id: "hours", label: settings.store_hours },
  ].filter(Boolean)

  return (
    <footer className="bg-gray-100 dark:bg-[#031730] py-8 sm:py-10">
      <div className="px-3 sm:px-4 lg:mx-auto lg:max-w-7xl">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Start Shopping
            </h6>
            <ul className="space-y-2 text-sm">
              {shopLinks.map((item) => (
                <li key={item.id || item.label}><Link to={item.href} className={LINK_CLASS}>{item.label}</Link></li>
              ))}
            </ul>
          </nav>

          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Support
            </h6>
            <ul className="space-y-2 text-sm">
              {accountLinks.map((item) => (
                <li key={item.id || item.label}><Link to={item.href} className={LINK_CLASS}>{item.label}</Link></li>
              ))}
            </ul>
          </nav>

          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Visit Us
            </h6>
            <ul className="space-y-2 text-sm">
              {contactRows.length === 0 ? (
                <li className={LINK_CLASS}>{settings.store_name}</li>
              ) : contactRows.map((row) => (
                <li key={row.id}>
                  {row.href ? (
                    <a href={row.href} className={LINK_CLASS}>{row.label}</a>
                  ) : (
                    <span className={LINK_CLASS}>{row.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <nav>
            <h6 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-white">
              Social
            </h6>
            <div className="flex gap-4">
              {socialLinks.map((item) => {
                const isInstagram = /instagram/i.test(item.label || item.href || "")
                return (
                  <a
                    key={item.id || item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    className="text-gray-600 hover:text-[#0b2e59] dark:text-gray-400 dark:hover:text-white transition-colors duration-200"
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.alt_text || item.label} className="h-6 w-6" />
                    ) : isInstagram ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="fill-current">
                        <path d="M7.75 2C4.574 2 2 4.574 2 7.75v8.5C2 19.426 4.574 22 7.75 22h8.5C19.426 22 22 19.426 22 16.25v-8.5C22 4.574 19.426 2 16.25 2h-8.5zm0 2h8.5C18.216 4 20 5.784 20 7.75v8.5c0 1.966-1.784 3.75-3.75 3.75h-8.5C5.784 20 4 18.216 4 16.25v-8.5C4 5.784 5.784 4 7.75 4zm8.75 1.5a1 1 0 100 2 1 1 0 000-2zM12 7a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="fill-current">
                        <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
                      </svg>
                    )}
                  </a>
                )
              })}
            </div>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-500 dark:text-gray-500">
          &copy; {new Date().getFullYear()} {settings.store_name}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

export default Footer
