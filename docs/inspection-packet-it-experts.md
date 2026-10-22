# System Inspection Packet for IT Expert Evaluators

**System:** Development and Implementation of a Cross-Platform Ecosystem for Whiskers Petshop with Data Analytics
**Accompanies:** Form T — System Evaluation Questionnaire (ISO/IEC 25010:2011)
**Packet revision:** 22 October 2026 — payment path documented as the PayMongo gateway; automated suites re-run and the companion Form N (non-IT) survey closed the same day

*This packet gives you everything needed to evaluate the system beyond clicking through it: what the system is supposed to do, how it is built, how to run your own copy, and what the automated test suites report. You do not need source-code access to answer Form T — but you are encouraged to verify claims yourself using the black-box checks in Section 5.*

---

## 🔗 System Access

| Item | Value |
|---|---|
| **Live system** | `[SYSTEM LINK — paste the deployed URL here, e.g. https://whiskerspetshop.ph]` |
| **Staff demo account** | demo-staff@example.com / `DemoStaff!123` (Staff Panel — orders, products, payments, support) |
| **Admin demo account** | demo-admin@example.com / `DemoAdmin!123` (Admin Dashboard — analytics, content, audit logs) |
| **Customer demo account** | demo-user@example.com / `DemoUser!123` (storefront, checkout, reviews) |

*Sign-in is required before checkout. Staff and admin panels ask for password re-verification (step-up) before state-changing actions — simply re-enter the same account password. Please restore any data you change (order statuses, content) where the interface allows, and avoid deleting seeded products or content.*

---

## 1. System Identity and Scope

**Purpose.** Whiskers Petshop is a family-owned pet supply store in Marikina City. This system moves its operations online: customers shop and get pet-food recommendations, staff manage orders and products, and management gets analytics for decision-making.

**User roles.**

| Role | What they can do |
|---|---|
| **Customer** | Register/login, browse and search the catalog, view product details (description, ingredients, feeding guide, stock), maintain pet profiles and receive food recommendations, cart and checkout (promo codes, shipping rules; cashless payment through the **PayMongo payment gateway** — hosted checkout for GCash, Maya, and cards — or cash on delivery), order history and receipts, product reviews (1–5 stars + comment on purchased items), service booking, support requests, profile management |
| **Staff** | Everything above where applicable, plus: order status management (triggers customer email), product management (limited fields — no cost/supplier visibility), payment monitoring (read-only), support replies |
| **Admin** | All staff functions plus: role management, product costing and lifecycle (cost/supplier, price history, archive/restore, CSV import/export), promotions (percent/fixed/free-shipping codes with scopes, limits, windows), content management (media library, banners, home sections, navigation, FAQs, policy pages, site settings incl. shipping fee, free-shipping threshold, maintenance mode), customer management, analytics dashboards and reports, audit logs (every admin write and staff/admin sign-in recorded in plain language with old → new values) |

**Stated delimitations** (per the study's Chapter I): the recommendation engine is rule-based (prescription/health-condition driven), not advanced AI — no image-based body-condition analysis, no LLMs, no predictive wellness modeling. No point-of-sale or in-store employee management. No advanced pet health monitoring.

---

## 2. Architecture Overview

**Pattern.** Single-page responsive web application (installable as a PWA) talking to a **modular-monolith REST API**; managed cloud database. No microservices, no WebSocket push — updates arrive by re-fetch (content cached ~30 s with invalidation on admin writes).

| Layer | Technology | Notes |
|---|---|---|
| Front end | React 19 + Vite 6 + Tailwind CSS 3 / daisyUI | Responsive layouts (tested at 360×800 and 390×844); PWA manifest + service worker (offline shell); pet profiles stored on-device (localStorage), not in the database |
| API | Node.js 20 + Express 4 (ESM) | Feature routers (catalog, cart, orders, admin, content, audit, support); helmet security headers; per-IP rate limiting; structured logging (pino); image upload processing (multer + sharp) |
| Database | Supabase (managed PostgreSQL) | Row-level security; one `profiles` table with a role attribute (user/staff/admin); foreign keys are NO ACTION (no cascade deletes); money columns are `numeric(12,2)` in Philippine pesos |
| Authentication | Supabase Auth (GoTrue) → JWT bearer tokens | Server-side role gates (`requireStaff`, `requireAdmin`); **step-up re-verification** — staff/admin must re-enter their password before any state-changing action (returns HTTP 403 until satisfied) |
| Sensitive data | AES-256-GCM field-level encryption | Encryption key held server-side in environment configuration, never sent to the client |
| Email | Transactional email provider (Brevo) | Order receipts, status updates, support replies, password resets; skips gracefully (logged) when unconfigured |
| Payments | PayMongo payment gateway | Cashless orders (GCash, Maya; cards in production) settle through the gateway's hosted checkout. The prototype runs a **simulated gateway at the same seam** — its callback (`POST /api/orders/:id/simulate-payment`) stands in for PayMongo's webhook with the same transition rules; in production that seam verifies webhook signature + amount instead of trusting the caller. Cash on delivery remains a staff-verified manual method |
| Deployment | Docker Compose; HTTPS via reverse proxy | Target: Oracle Always Free VM; frontend build is static files; backend image installs production dependencies only (`npm ci --omit=dev`) |

**Consistency guarantees worth checking:** checkout writes order + line snapshots (`unit_price`, `unit_cost`, `discount_amount`) + payment row; stock decrements exactly once per order; re-submitting a review updates the existing row; every admin write produces an audit entry; all server input is validated before any database write (junk phone/address values are rejected with HTTP 400). **Payment state changes only through the gateway callback:** success marks the payment `succeeded` and moves the order to Processing (idempotent — a repeat confirmation never double-charges or sends a second receipt); a failed confirmation marks the payment `failed` but leaves the order Pending so the customer can retry; an order unpaid past the 30-minute window is cancelled by a lazy expiry sweep that restores stock and releases promo reservations.

---

## 3. Running Your Own Copy (from the project README)

**Prerequisites:** Node.js 20+, a Supabase project (free tier works), Docker (only for the containerised path).

```bash
# 1. Install dependencies
npm install && npm install --prefix backend && npm install --prefix frontend

# 2. Configure environment (templates explain every variable)
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
#    fill SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, ENCRYPTION_KEY
#    (backend) and VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (frontend)

# 3. Run both services
npm run dev:local        # backend :4141, frontend :5173 (Vite proxies /api)
```

**Demo accounts (pre-seeded):**

| Role | Email | Password |
|---|---|---|
| User | demo-user@example.com | DemoUser!123 |
| Staff | demo-staff@example.com | DemoStaff!123 |
| Admin | demo-admin@example.com | DemoAdmin!123 |

**Automated suites:**

```bash
npm test --prefix backend     # node --test: 231 cases
npm test --prefix frontend    # vitest: 327 cases (use --no-file-parallelism on low-memory machines)
npm run test:e2e --prefix backend   # 191 live-API checks (needs a freshly restarted backend)
```

---

## 4. Automated Test Evidence (executed 2026-10-22)

| Suite | Scope | Result |
|---|---|---|
| Backend unit/integration | Business rules, validation, roles, promos, costing, CMS rules, email templates, audit | **231 / 231 passed, 0 failed** |
| Frontend unit | Components, pages, recommendation engine, cart/checkout logic, audit views, permissions | **327 / 327 passed, 0 failed** (34 files) |
| End-to-end API walkthrough | Full customer journey, staff/admin role matrix, step-up flow, content CMS, promos, audit trail, schema probes — against a live server | **191 / 191 passed** |
| Manual UI quality pass | 24 routes screenshot-swept at mobile viewports; loading/empty/error states; WCAG keyboard/focus checks on modals | **24 / 24 passed** |

**Security posture (OWASP Top 10 summary).** Verified by automated tests and manual inspection: cross-role access rejected (Customer token on staff/admin endpoints → denied; Staff on admin-only → denied; admin write without step-up → HTTP 403); foreign order/support-thread access → 404; SQL/NoSQL injection attempts in search, login, address, phone, promo, and message fields → parameterized queries and HTTP 400 rejections; expired/tampered/forged JWTs → rejected; per-IP rate limiting → HTTP 429 after the configured window; helmet security headers on every response; dependency review via `npm audit` (residual findings are dev-tooling-only; production images exclude dev dependencies).

**Evaluation status (2026-10-22).** The suites above were re-run on the same day the companion non-IT user survey (Form N) closed: 16 completed responses were collected on 22 October 2026 and encoded in Chapter IV (Tables 4.6 and 4.8). This packet accompanies Form T — the technical half of the same ISO/IEC 25010 evaluation — and your ratings will be compared against the non-IT results in Chapter IV, Table 4.10. The two samples are kept distinct: the user survey reports *perceived* quality from everyday use, while Form T is expected to report *built-in* quality from inspection and verification.

---

## 5. Suggested Black-Box Checks (≈10 minutes on the live system)

You are welcome to verify any of the following directly — they are the observable counterparts of the questionnaire items:

1. **Security headers / TLS:** `curl -I https://[system-url]/api/site-content` — inspect headers; confirm HTTPS. (For direct API checks, note the storefront proxies `/api/*` to the backend.)
2. **Rate limiting:** repeat a login or API call in a tight loop; expect HTTP 429 after the limit.
3. **Auth flow:** open DevTools → Network; log in and observe the JWT bearer token on subsequent requests; attempt an admin action with the staff account and observe the 403/step-up behavior.
4. **Validation:** submit junk in phone/address fields (letters, 300+ characters) — expect HTTP 400, not a crash.
5. **Stock integrity:** attempt to add more than available stock to the cart; place an order and confirm stock decrements by exactly the ordered quantity.
6. **Payment gateway (the PayMongo seam):** place an order paid with GCash or Maya — the pay page is the simulated gateway, which stands in for PayMongo's hosted checkout. Confirm *success* → the payment reads `succeeded`, the order moves to Processing, and a receipt arrives; confirm *fail* → the payment reads `failed` but the order stays Pending so the customer can retry; leave an order unpaid past the 30-minute window → it is cancelled and stock is restored. In production the same seam is PayMongo's webhook, which verifies signature and amount.
7. **Performance:** DevTools → Lighthouse (mobile) and Network waterfall; note image sizes (uploads are resized server-side) and any 30-second content refresh.
8. **Compatibility:** test the same flows on a phone and a desktop browser; resize to 360 px width — no horizontal overflow expected.
9. **Accessibility:** navigate the site using only Tab/Enter; modals should trap and restore focus.
10. **PWA:** install the site to a home screen (Chrome → Install app) and load it once offline — the shell should load.
11. **Accountability:** place an order and confirm receipt email + official receipt; with the admin account, open Audit Logs and verify plain-language who/what/old → new entries.

---

*Thank you for evaluating the system. When answering Form T, base each rating on what you observed or verified — gaps you identify are more valuable to the researchers than praise. If anything in this packet is unclear, contact the researchers before answering.*
