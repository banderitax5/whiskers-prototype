import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Production policy, byte-identical to deploy/Caddyfile and frontend/nginx.conf
// (backend/test/securityHeaders.test.js fails if the two servers drift).
//
// style-src stays at 'self' (no 'unsafe-inline') and the only inline style the
// app needs - React's `style` attributes, e.g. the chart bar widths - is allowed
// by the narrower style-src-attr. Anything that injects a <style> element is
// therefore blocked, which is the part of CSS injection that can restyle or
// overlay the page. The dev server below relaxes style-src too because Vite
// injects its stylesheets as <style> elements for HMR.
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://static.cloudflareinsights.com; script-src-attr 'none'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cloudflareinsights.com; media-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'"

// @vitejs/plugin-react injects an inline Fast Refresh preamble into index.html
// and Vite injects HMR stylesheets as <style> elements; the built bundle has
// neither. Both relaxations exist only on `npm run dev`.
const DEV_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace(
  "script-src 'self'",
  "script-src 'self' 'unsafe-inline'"
).replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")

const baseHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

const devHeaders = { ...baseHeaders, 'Content-Security-Policy': DEV_CONTENT_SECURITY_POLICY }
const previewHeaders = { ...baseHeaders, 'Content-Security-Policy': CONTENT_SECURITY_POLICY }

function applyHeaders(headers) {
  return function applySecurityHeaders(_req, res, next) {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value)
    }
    res.removeHeader('X-Powered-By')
    next()
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*.png', 'logo/logo-whiskers.png'],
        manifest: {
          id: '/',
          name: 'Whiskers - Pet Food & Supplies',
          short_name: 'Whiskers',
          description: 'Personalized pet food recommendations based on your pet\'s health profile',
          lang: 'en',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#ffffff',
          theme_color: '#0b2e59',
          categories: ['shopping', 'pets'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        // Serve the SPA shell for navigations. It must never be a static
        // page: createHandlerBoundToURL() answers from the precache without
        // touching the network, so pointing this at offline.html made every
        // full page load (email links, typed URLs, reopen) show "You're offline".
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/health$/, /^\/sw\.js$/, /^\/registerSW\.js$/],
          cleanupOutdatedCaches: true,
          // Precache only the app shell; images are cached lazily after the
          // first view so the install stays small on mobile connections.
          runtimeCaching: [
            {
              urlPattern: /\.(?:png|jpe?g|webp|gif|svg)(?:\?.*)?$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'whiskers-images',
                expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
          ],
        },
      }),
      {
        // The dev server relaxes the two directives that Vite's own tooling
        // needs; `npm run preview` serves the built bundle and therefore uses
        // the exact production policy, so a local preview exercises the real
        // header (the preview server is also the only way to test the PWA
        // locally).
        name: 'security-headers',
        configureServer(server) {
          server.middlewares.use(applyHeaders(devHeaders))
        },
        configurePreviewServer(server) {
          server.middlewares.use(applyHeaders(previewHeaders))
        },
      },
    ],
    server: {
      allowedHosts: ['.trycloudflare.com', 'whiskerspet.me'],
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:4141',
          changeOrigin: true,
        },
      },
    },
  }
})