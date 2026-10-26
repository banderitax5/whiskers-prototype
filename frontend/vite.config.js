import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "media-src 'self'",
    "worker-src 'self' blob:",
  ].join('; '),
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
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
        name: 'security-headers',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            for (const [key, value] of Object.entries(securityHeaders)) {
              res.setHeader(key, value)
            }
            res.removeHeader('X-Powered-By')
            next()
          })
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