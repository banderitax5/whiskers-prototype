import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

    test('the dev server inherits the production policy and relaxes only what Vite needs', () => {
      assert.equal(vite.policy, caddy.policy)
      // script-src: the React Fast Refresh preamble is an inline script.
      assert.match(
        vite.text,
        /CONTENT_SECURITY_POLICY\.replace\(\s*"script-src 'self'",\s*"script-src 'self' 'unsafe-inline'"\s*\)/
      )
      // style-src: Vite injects HMR stylesheets as <style> elements.
      assert.match(
        vite.text,
        /\.replace\("style-src 'self';", "style-src 'self' 'unsafe-inline';"\)/
      )
      assert.ok(!vite.text.includes("'unsafe-eval'"), "dev must not need 'unsafe-eval'")
    })

    test('the preview server serves the strict production policy', () => {
      // `npm run preview` serves the built bundle, which has no inline scripts
      // and no injected <style> elements, so it must not inherit the dev
      // relaxations.
      assert.match(vite.text, /configurePreviewServer\(server\) \{\s*server\.middlewares\.use\(applyHeaders\(previewHeaders\)\)/)
      assert.match(vite.text, /const previewHeaders = \{ \.\.\.baseHeaders, 'Content-Security-Policy': CONTENT_SECURITY_POLICY \}/)
    })

    test("style-src never allows 'unsafe-inline' in the production servers", () => {
      // ZAP rates "CSP: style-src unsafe-inline" as Medium. Inline `style`
      // attributes (React, and previously react-hot-toast's goober runtime)
      // are allowed by the narrower style-src-attr instead; injected <style>
      // elements stay blocked.
      for (const { policy } of [caddy, nginx]) {
        const styleSrc = directive(policy, 'style-src')
        assert.ok(styleSrc, 'style-src is missing')
        assert.ok(!styleSrc.includes("'unsafe-inline'"), "style-src must not allow 'unsafe-inline'")
        assert.equal(styleSrc, "'self'")
        assert.equal(directive(policy, 'style-src-attr'), "'unsafe-inline'")
      }
      assert.equal(directive(vite.policy, 'style-src'), "'self'")
      assert.equal(directive(vite.policy, 'style-src-attr'), "'unsafe-inline'")
    })

    test('the API serves the same strict style-src', () => {
      // helmet's CSP only ever decorates JSON, but keeping the same shape
      // stops a future HTML error page from re-introducing the ZAP finding.
      const index = readFileSync(path.join(REPO_ROOT, 'backend', 'index.js'), 'utf8')
      assert.match(index, /styleSrc: \["'self'"\]/)
      assert.match(index, /styleSrcAttr: \["'unsafe-inline'"\]/)
      assert.ok(!index.includes(`styleSrc: ["'self'", "'unsafe-inline'"]`))
    })

    test('the app ships no <style> element of its own', () => {
      // A single <style> in the bundle would be blocked at runtime by
      // style-src 'self'. Keep the loading-skeleton keyframes in index.css.
      // Comments are stripped first: prose about <style> is not markup.
      const src = path.join(REPO_ROOT, 'frontend', 'src')
      const stripComments = (text) =>
        text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const offenders = []
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (/\.(jsx?|html)$/.test(entry.name) && /<style[\s>]/.test(stripComments(readFileSync(full, 'utf8')))) {
            offenders.push(path.relative(REPO_ROOT, full))
          }
        }
      }
      if (existsSync(src)) walk(src)
      const indexHtml = path.join(REPO_ROOT, 'frontend', 'index.html')
      if (existsSync(indexHtml) && /<style[\s>]/.test(stripComments(readFileSync(indexHtml, 'utf8')))) {
        offenders.push(path.relative(REPO_ROOT, indexHtml))
      }
      assert.deepEqual(offenders, [], `inline <style> blocks would be blocked by style-src: ${offenders.join(', ')}`)
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
