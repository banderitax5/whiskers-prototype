# petconnect-prototype

Whiskers Petshop is an e-commerce prototype for pet food and supplies, with personalized product recommendations built from each pet's health profile. Built as the capstone project of 4 students at FEU Roosevelt, Marikina, Philippines.

## Tech stack

- **Frontend** — React 19, Vite 6, Tailwind CSS 3 + daisyUI, React Router 7, PWA (installable, offline fallback), Supabase client for auth
- **Backend** — Node.js with Express 4 (ESM), helmet, express-rate-limit, pino logging, multer + sharp for image uploads, AES-256-GCM field encryption
- **Database** — Supabase (PostgreSQL with row-level security)

## Project structure

```
backend/     Express API, runs on port 4141
frontend/    React app, runs on port 5173 (dev)
docker-compose.yml
```

The API is mounted under `/api/*` and exposes `GET /health` for checks.

## Prerequisites

- Node.js 20 or newer
- A Supabase project (free tier works)
- Docker (only for the containerized setup)

## Environment setup

Both services need their own env file. The templates contain comments explaining every variable.

```bash
# Backend
copy backend\.env.example backend\.env

# Frontend
copy frontend\.env.example frontend\.env
```

Then fill in:

- **Backend** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `ENCRYPTION_KEY` (generate one with the command printed in the template), optional `TRUST_PROXY`, step-up settings, email settings (`BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`), and optionally `PAYMONGO_SECRET_KEY` + `PAYMONGO_WEBHOOK_SECRET` for online payments
- **Frontend** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_API_BASE` and `VITE_PROXY_TARGET`

Never commit the real `.env` files.

### Email receipts (optional)

Order confirmations email the customer a receipt through Brevo. The feature
switches on the moment `BREVO_API_KEY` + `MAIL_FROM_EMAIL` are set in
`backend/.env`; without them checkout behaves exactly as before (receipt
skipped, logged). Brevo's free tier (300 emails/day) covers a shop this
size, and the sender can be a verified Gmail address — no domain purchase
needed. Password-reset emails are handled separately by Supabase and need
no setup.

### Online payments (optional — PayMongo)

GCash and Maya orders can be paid through [PayMongo](https://www.paymongo.com)
hosted checkout. Without configuration the app uses a **simulated** pay page
(`/pay/simulate`) so development and E2E tests need no account or network.

To enable real payments set in `backend/.env`:

```bash
PAYMONGO_SECRET_KEY=sk_test_...      # sk_live_... for production
PAYMONGO_WEBHOOK_SECRET=whsec_...    # must match the key mode (test vs live)
PUBLIC_SITE_URL=https://your-domain  # used for the success/cancel redirects
```

Then register a webhook pointing at
`https://YOUR_DOMAIN/api/payments/paymongo/webhook` for the
`checkout_session.payment.paid` event (Dashboard → Developers → Webhooks, or
`POST https://api.paymongo.com/v1/webhooks`). Keep `PAYMONGO_WEBHOOK_SECRET`
in sync with that endpoint. While a PayMongo key is configured the simulated
endpoint is closed, so a client can never mark an order paid by itself.

## Run for development

Install dependencies once per folder:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

Then start everything from the repo root:

```bash
npm run dev:local
```

This runs backend (4141) and frontend (5173) together in one terminal. `npm run dev` does the same plus a Cloudflare quick tunnel to the frontend (requires `cloudflared` on your PATH).

Or run the services separately:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

Open http://localhost:5173 — the Vite dev server proxies `/api` requests to the backend, so no CORS setup is needed locally.

## Install as an app (PWA)

The app ships a web app manifest, maskable icons, and a Workbox service worker, so it can be installed on desktop and mobile. Installation needs a **production build over HTTPS** (or `http://localhost`), because browsers disable service workers on plain HTTP. The Vite dev server does not register the service worker.

```bash
# Build once, then serve the PWA locally on http://localhost:4173
npm run build --prefix frontend
npm run preview --prefix frontend
```

How to install:

- **Chrome / Edge / Android Chrome** — use the install icon in the address bar, or the browser menu → *Install Whiskers*.
- **iOS / iPadOS Safari** — tap *Share* → *Add to Home Screen*. The `apple-touch-icon` and standalone meta tags are already set.
- **Docker / production** — `docker compose up --build` serves the built SPA through nginx with the service worker and manifest; put it behind HTTPS (Caddy, nginx, or a Cloudflare tunnel) before installing from another device.

The service worker precaches the app shell, answers offline navigations with the SPA, and caches images after their first view. API calls always go to the network so prices, stock, and orders stay live.

## Demo accounts

Pre-seeded in Supabase for demos and panel review:

| Role | Email | Password | Lands on |
|------|-------|----------|----------|
| User | demo-user@example.com | `DemoUser!123` | Storefront |
| Staff | demo-staff@example.com | `DemoStaff!123` | Staff Panel — orders, products, payments, support |
| Admin | demo-admin@example.com | `DemoAdmin!123` | Admin Dashboard — analytics, customers, audit logs |

Staff and admin panels ask for password re-verification (step-up) before
state-changing actions — type the same account password.

## Two-factor authentication (optional)

Accounts can add a TOTP second factor (Google Authenticator, Authy, 1Password,
and similar) from **Profile → Two-factor authentication**.

- Supabase Auth owns the factor. The backend only proxies enrollment and
  verification, so the shared secret is never stored by this application.
- It is optional for every role. Without a verified factor, the admin panel is
  reachable with just the password (keeps demos simple). Once enabled, sign-in
  returns an aal1 session that must be upgraded with a 6-digit code; protected
  API routes reject aal1.
- There are no backup codes (a Supabase TOTP limitation). If a user loses their
  device, an admin removes the factor in **Supabase Dashboard → Authentication
  → Users → (user) → Factors**; the account can then sign in with its password
  and enroll again.
- No extra environment variables are needed beyond the existing Supabase keys.
- Users who lose their device can read the recovery steps on the public
  `/help/lost-authenticator` page; every MFA challenge links to it and offers
  the shop's phone/email (from Admin Settings) so the request can be verified.

## Tests, lint, and build

```bash
# Backend API tests (Node's built-in test runner)
npm test --prefix backend

# Full API end-to-end suite against a running backend.
# Creates a throwaway Supabase user, exercises orders, stock, feedback,
# support, MFA, staff/admin role gates, and the step-up re-auth round-trip,
# then cleans everything up. Restart the backend before each run.
npm run test:e2e --prefix backend

# Frontend lint
npm run lint --prefix frontend

# Frontend production build
npm run build --prefix frontend

# UI quality report
npm run doctor
```

## Run with Docker

1. Copy env templates (see above) and fill in real Supabase keys in both env files.
2. Build and start:

   ```bash
   docker compose up --build
   ```

3. Open:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4141

Each image builds from its own service folder, so compose works straight from the repo root. Backend images install production dependencies only (`npm ci --omit=dev`, `NODE_ENV=production`).

## Deployment (recommended target)

The deployment target is a **Microsoft Azure virtual machine** (Azure for Students credit — sizes, costs, and step-by-step provisioning are in `deploy/DEPLOY.md`) running Docker Compose:

1. Provision the VM (Ubuntu), open only ports 22, 80, and 443.
2. Install Docker, clone the repo, copy both `.env.example` files to `.env` and fill in Supabase keys.
3. `docker compose up --build` (run `docker compose config` first to validate) — **run the build once on the VM**; it is the canonical build check.
4. Put the frontend behind a reverse proxy (Caddy or nginx) on 443 with a Cloudflare-managed DNS record; point `VITE_PROXY_TARGET` at the backend container.
5. Keep Supabase on its free cloud tier (database + auth); the VM only runs the API and static frontend.

Render/Railway free tiers sleep after inactivity, so they do not satisfy the 24/7 requirement.

### Security headers

Every static response carries HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy`. The CSP
lives in `frontend/nginx.conf` (Docker image) and `deploy/Caddyfile` (systemd +
Caddy host); `backend/test/securityHeaders.test.js` fails if the two copies
drift. `/api/*` and `/health` are excluded on purpose — helmet already sets
those headers on API responses, and sending a second copy makes browsers see a
duplicated, malformed value.

- `script-src 'self'`: the built bundle has no inline scripts. The only
  third-party allowance is Cloudflare's edge-injected Web Analytics beacon, so
  **Rocket Loader must stay off** (it rewrites the bundle into inline scripts).
- `style-src 'self'` with `style-src-attr 'unsafe-inline'`: React sets sizes and
  colours through `style` **attributes** (chart bars, progress bars), which the
  attribute directive allows. Injecting a `<style>` element is blocked, which is
  the part of CSS injection that can restyle or overlay a page. Keep runtime
  stylesheets out of the bundle for this to stay true — the loading-skeleton
  keyframes live in `src/index.css` and the toast stack in `src/lib/toast.js`
  renders with Tailwind classes (the previous toast library, react-hot-toast,
  injected a `<style>` element and had to go).
- Images are limited to this site, Supabase Storage, and `data:`/`blob:`
  previews. An admin who pastes an image URL from another host gets a broken
  image; upload it to the Media Library instead.
- After changing the policy: rebuild the frontend image (`docker compose up -d
  --build frontend`), or on the Caddy host `sudo caddy validate --config
  /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy`.
  `npm run dev` relaxes `script-src` and `style-src` because Vite injects the
  Fast Refresh preamble and HMR stylesheets as inline content; `npm run preview`
  serves the built bundle with the exact production policy.

## Troubleshooting

- **`EADDRINUSE` on 4141 or 5173** — a previous dev server is still running. Close it or kill the process holding the port.
- **Proxy errors in the browser console** — the backend is not running, or it is on a custom port. Point `VITE_PROXY_TARGET` at the right address.
- **Auth or Supabase errors on load** — the frontend env file is missing or has placeholder values.
- **`npm audit` reports high-severity issues** — the remaining ones come from dev-only tooling chains (chokidar/braces) and are not shipped by the backend at runtime. For production images, install with `npm ci --omit=dev`.
