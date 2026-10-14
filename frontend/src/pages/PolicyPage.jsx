// Phase 6 - policy pages written by the owner in Site Settings.
// Plain text body rendered as paragraphs; the page is reachable at
// /policies/:slug and linked from the About page.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSiteContent, contentPolicies } from '../lib/siteContent.js'

function PolicyPage() {
  const { slug } = useParams()
  const [policy, setPolicy] = useState(null) // null = still loading
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPolicy(null)
    setMissing(false)
    fetchSiteContent().then((content) => {
      if (cancelled) return
      const rows = contentPolicies(content) || []
      const found = rows.find((p) => p.slug === slug)
      if (found) setPolicy(found)
      else setMissing(true)
    })
    return () => { cancelled = true }
  }, [slug])

  if (missing) {
    return (
      <div className="w-full lg:mx-auto lg:max-w-3xl py-10 text-center space-y-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Page not found</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400">This policy page does not exist or is no longer published.</p>
        <Link to="/about" className="inline-block text-sm font-semibold text-[#0b2e59] dark:text-yellow-300 hover:underline">
          Back to About &amp; FAQs
        </Link>
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="w-full lg:mx-auto lg:max-w-3xl py-10">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-6" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" style={{ width: `${90 - i * 7}%` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <article className="w-full lg:mx-auto lg:max-w-3xl py-6 sm:py-8 space-y-5">
      <header className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{policy.title}</h1>
        <Link to="/about" className="inline-block text-sm font-semibold text-[#0b2e59] dark:text-yellow-300 hover:underline">
          &larr; About &amp; FAQs
        </Link>
      </header>
      <div className="space-y-4 text-sm sm:text-base text-gray-700 dark:text-slate-300 leading-relaxed">
        {String(policy.body || '')
          .split(/\n{2,}/)
          .map((para, i) => (
            <p key={i}>{para}</p>
          ))}
      </div>
    </article>
  )
}

export default PolicyPage
