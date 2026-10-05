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

- **Backend** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `ENCRYPTION_KEY` (generate one with the command printed in the template), optional `TRUST_PROXY` and step-up settings
- **Frontend** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_API_BASE` and `VITE_PROXY_TARGET`

Never commit the real `.env` files.

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

## Tests, lint, and build

```bash
# Backend API tests (Node's built-in test runner)
npm test --prefix backend

# Full API end-to-end suite: 25 checks against a running backend.
# Creates a throwaway Supabase user, exercises orders, stock, feedback,
# support, admin, and the step-up gate, then cleans everything up.
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

Each image builds from its own service folder, so compose works straight from the repo root.

## Troubleshooting

- **`EADDRINUSE` on 4141 or 5173** — a previous dev server is still running. Close it or kill the process holding the port.
- **Proxy errors in the browser console** — the backend is not running, or it is on a custom port. Point `VITE_PROXY_TARGET` at the right address.
- **Auth or Supabase errors on load** — the frontend env file is missing or has placeholder values.
- **`npm audit` reports high-severity issues** — the remaining ones come from dev-only tooling chains (chokidar/braces) and are not shipped by the backend at runtime. For production images, install with `npm ci --omit=dev`.
