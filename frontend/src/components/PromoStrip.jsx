import { useEffect, useState } from 'react'
import { fetchSiteContent, contentBanners, trackBannerEvent } from '../lib/siteContent.js'
import BannerLink from './BannerLink.jsx'

// Slim banner band under the site header (all pages). Shows the first
// published promo_strip banner as a full-width image with an optional
// title / call-to-action overlay; renders nothing when none is published.
export default function PromoStrip() {
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchSiteContent().then((data) => {
      if (cancelled) return
      const b = contentBanners(data, 'promo_strip')?.[0] || null
      setBanner(b)
      if (b?.id) trackBannerEvent(b.id, 'impression')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!banner?.desktop_image_url && !banner?.mobile_image_url && !banner?.title) return null

  const label = banner.title || banner.subtitle || 'Promotion'

  return (
    <div className="px-3 sm:px-4 pt-3 sm:pt-4">
      <BannerLink
        banner={banner}
        ariaLabel={label}
        className="group relative block overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800 h-16 sm:h-20 md:h-24"
      >
        <picture>
          {banner.mobile_image_url && (
            <source media="(max-width: 640px)" srcSet={banner.mobile_image_url} />
          )}
          {banner.desktop_image_url ? (
            <img
              src={banner.desktop_image_url}
              alt={banner.alt || label}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="h-full w-full bg-[#0b2e59]" />
          )}
        </picture>
        {(banner.title || banner.button_text) && (
          <div className="absolute inset-0 flex items-center justify-between gap-3 px-4 sm:px-6 bg-gradient-to-r from-black/50 via-black/20 to-transparent">
            <span className="text-white text-xs sm:text-sm md:text-base font-bold drop-shadow truncate">
              {banner.title}
            </span>
            {banner.button_text && (
              <span className="shrink-0 rounded-full bg-[#ffd21e] text-[#0b2e59] text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 uppercase tracking-wide group-hover:brightness-95">
                {banner.button_text}
              </span>
            )}
          </div>
        )}
      </BannerLink>
    </div>
  )
}
