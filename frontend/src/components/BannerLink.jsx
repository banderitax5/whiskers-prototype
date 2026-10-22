import { Link } from 'react-router-dom'
import { bannerHref } from '../lib/bannerLink.js'
import { trackBannerEvent } from '../lib/siteContent.js'

// Clickable wrapper around a banner: internal destinations stay in the SPA,
// external ones open a normal link. Records a click event when there is a
// destination. When the banner has no usable link, it renders a plain
// container so the banner still shows as content.
export default function BannerLink({ banner, className, ariaLabel, children }) {
  const href = bannerHref(banner)
  const onClick = () => {
    if (banner?.id) trackBannerEvent(banner.id, 'click')
  }

  if (!href) {
    return (
      <div className={className} aria-label={ariaLabel}>
        {children}
      </div>
    )
  }

  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} onClick={onClick} className={className} aria-label={ariaLabel} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }

  return (
    <Link to={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}
