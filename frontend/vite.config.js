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
        manifest: {
          name: 'Whiskers - Pet Food & Supplies',
          short_name: 'Whiskers',
          description: 'Personalized pet food recommendations based on your pet\'s health profile',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#0b2e59',
          categories: ['shopping', 'pets'],
          icons: [
            { src: '/logo/logo-whiskers.png', sizes: '192x192', type: 'image/png' },
            { src: '/logo/logo-whiskers.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/offline.html',
          navigateFallbackDenylist: [/^\/api/],
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
      allowedHosts: ['.trycloudflare.com'],
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:4141',
          changeOrigin: true,
        },
      },
    },
  }
})