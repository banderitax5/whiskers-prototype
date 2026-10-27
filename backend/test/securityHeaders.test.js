import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The CSP is duplicated in three places because Caddy, nginx and Vite each own
// their own config format. This test is the guard that keeps them in sync: a
// policy that only exists in one server config is how "we fixed the CSP" turns
// into "the scan still fails on the Docker path" six weeks later.
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const CADDY = path.join(REPO_ROOT, 'deploy', 'Caddyfile')
const NGINX = path.join(REPO_ROOT, 'frontend', 'nginx.conf')
const VITE = path.join(REPO_ROOT, 'frontend', 'vite.config.js')

// A backend-only deployment (the API shipped without the frontend repo) has no
// server configs to check; skipping beats failing for a missing sibling folder.
const hasConfigs = existsSync(CADDY) && existsSync(NGINX) && existsSync(VITE)

function policyIn(file) {
  const text = readFileSync(file, 'utf8')
  const match = text.match(/"(default-src 'self'[^"]*)"/)
  assert.ok(match, `no Content-Security-Policy string found in ${path.basename(file)}`)
  return { policy: match[1], text }
}

function directive(policy, name) {
  const found = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
  return found ? found.slice(name.length).trim() : null
}

if (!hasConfigs) {
  describe('production security headers', { skip: 'frontend configs not present' }, () => {
    test('nothing to check in a backend-only deployment', () => {})
  })
} else {
  const caddy = policyIn(CADDY)
  const nginx = policyIn(NGINX)
  const vite = policyIn(VITE)

  describe('production security headers', () => {
    test('Caddy and nginx serve byte-identical policies', () => {
      assert.equal(caddy.policy, nginx.policy)
    })

    test('the dev server inherits the production policy and relaxes only script-src', () => {
      assert.equal(vite.policy, caddy.policy)
      assert.match(
        vite.text,
        /CONTENT_SECURITY_POLICY\.replace\(\s*"script-src 'self'",\s*"script-src 'self' 'unsafe-inline'"\s*\)/
      )
      assert.ok(!vite.text.includes("'unsafe-eval'"), "dev must not need 'unsafe-eval'")
    })

    test('script-src never allows inline or eval in the production servers', () => {
      for (const { policy } of [caddy, nginx]) {
        const scriptSrc = directive(policy, 'script-src')
        assert.ok(scriptSrc, 'script-src is missing')
        assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src must not allow 'unsafe-inline'")
        assert.ok(!scriptSrc.includes("'unsafe-eval'"), "script-src must not allow 'unsafe-eval'")
        assert.ok(!scriptSrc.includes("'unsafe-hashes'"), "script-src must not allow 'unsafe-hashes'")
      }
    })

    test('locks the directives that stop script injection and framing', () => {
      for (const { policy } of [caddy, nginx, vite]) {
        assert.equal(directive(policy, 'default-src'), "'self'")
        assert.equal(directive(policy, 'object-src'), "'none'")
        assert.equal(directive(policy, 'base-uri'), "'self'")
        assert.equal(directive(policy, 'form-action'), "'self'")
        assert.equal(directive(policy, 'frame-ancestors'), "'none'")
        assert.equal(directive(policy, 'script-src-attr'), "'none'")
      }
    })

    test('allows no bare scheme or wildcard source', () => {
      for (const { policy } of [caddy, nginx, vite]) {
        const sources = policy
          .split(';')
          .flatMap((part) => part.trim().split(/\s+/).slice(1))
        assert.ok(!sources.includes('*'), 'bare * source is not allowed')
        assert.ok(!sources.includes('https:'), 'scheme-wide https: is not allowed')
        assert.ok(!sources.includes('http:'), 'scheme-wide http: is not allowed')
      }
    })

    test('keeps images on the site, Supabase Storage and local previews', () => {
      assert.equal(directive(caddy.policy, 'img-src'), "'self' data: blob: https://*.supabase.co")
    })

    test('keeps the CSP off the reverse-proxied API handlers', () => {
      // Caddy: the header block lives in the static fallback handler only, so
      // helmet's own headers are the single copy on /api and /health.
      const caddyApiStart = caddy.text.indexOf('handle /api/* {')
      const caddyStatic = caddy.text.indexOf('# Static SPA')
      assert.ok(caddyApiStart > 0 && caddyStatic > caddyApiStart, 'Caddy handler layout changed')
      const caddyApi = caddy.text.slice(caddyApiStart, caddyStatic)
      assert.ok(!caddyApi.includes('Content-Security-Policy'), 'Caddy must not set a CSP on /api')

      // nginx: server-level add_header also runs for proxied responses, so the
      // upstream copy has to be hidden or the browser gets two CSP headers.
      const nginxApi = nginx.text.slice(nginx.text.indexOf('location /api/ {'), nginx.text.indexOf('location = /health'))
      assert.ok(nginxApi.includes('proxy_hide_header Content-Security-Policy;'))
      const nginxHealth = nginx.text.slice(nginx.text.indexOf('location = /health'))
      assert.ok(nginxHealth.includes('proxy_hide_header Content-Security-Policy;'))
    })

    test('frame-ancestors agrees with the X-Frame-Options sent next to it', () => {
      assert.match(caddy.text, /X-Frame-Options "DENY"/)
      assert.match(nginx.text, /add_header X-Frame-Options "DENY" always;/)
      assert.equal(directive(caddy.policy, 'frame-ancestors'), "'none'")
    })
  })
}
