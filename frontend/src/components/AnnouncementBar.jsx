import { useEffect } from 'react'
import { contentBanners, trackBannerEvent } from '../lib/siteContent.js'
import { useSiteContent } from '../lib/siteContentLive.js'
import { bannerHref } from '../lib/bannerLink.js'

// Thin message bar above the site header (all pages). Shows the first
// published announcement_bar banner as text; when the admin sets no
// announcement, nothing renders and the header stays exactly as it was.
// Live: an admin edit appears here without a refresh.
export default function AnnouncementBar() {
  const { content } = useSiteContent()
  const banner = contentBanners(content, 'announcement')?.[0] || null

  // one impression per displayed banner, including when a live edit swaps it
  useEffect(() => {
    if (banner?.id) trackBannerEvent(banner.id, 'impression')
  }, [banner?.id])

  if (!banner) return null

  const message = [banner.title, banner.subtitle].filter(Boolean).join(' — ')
  if (!message) return null

  const href = bannerHref(banner)
  const body = (
    <span className="inline-flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5">
      {banner.title && <span className="font-semibold">{banner.title}</span>}
      {banner.subtitle && <span className="text-white/80">{banner.subtitle}</span>}
      {href && banner.button_text && (
        <span className="font-bold underline underline-offset-2">{banner.button_text}</span>
      )}
    </span>
  )

  const onClick = () => {
    if (banner?.id) trackBannerEvent(banner.id, 'click')
  }

  return (
    <div role="region" aria-label="Announcement" className="bg-[#0b2e59] text-white text-center text-xs sm:text-sm px-3 py-1.5">
      {href ? (
        <a href={href} onClick={onClick} className="hover:underline">
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  )
}
