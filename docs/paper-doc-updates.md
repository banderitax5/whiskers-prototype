# Paper documentation updates — full re-read checklist (2026-10-20)

Source: Google Docs export of the capstone paper (same URL as AGENTS.md).
Compared against: the live system at commit `8b63d2b` (backend 219/219, frontend 314/314,
E2E 187/187, Supabase project with ~26 tables).

How to use this file: work top-to-bottom. Section 1 items are factual errors a panelist can
catch in minutes — fix first. Section 2 lists which diagrams to redraw and exactly what they
should contain. Section 4/5 are wording and screenshot work. Do not edit the code to match
stale paper text; edit the paper.

Legend: **[WRONG]** = paper states something the system does not do; **[STALE]** = true once,
outdated now; **[MISSING]** = system feature the paper never mentions.

---

## 1. Factual errors — fix before the panel (panel killers)

### 1.1 Socket.IO — **[WRONG]** (Figure 3.1.1 architecture paragraph)
Paper: "connected to the backend via real-time updates through Socket.IO."
Reality: zero Socket.IO code in the repository. Updates arrive by re-fetch
(short polling; site-content cached ~30 s with invalidation on admin writes).
Suggested replacement:
> All clients connect to the backend over REST/JSON with JWT bearer auth.
> Updates are near-real-time: the web app re-fetches on navigation and every
> ~30 seconds for live content, and admin edits invalidate the server cache
> immediately so shoppers see changes on their next visit. WebSocket push
> (Socket.IO) is listed as future work.

### 1.2 Capacitor.js hybrid mobile app — **[WRONG]** (Abstract, Figure 3.1.1)
Paper: "Capacitor.js hybrid mobile app and a React.js web app."
Reality: zero Capacitor code. The deliverable is a responsive React web app,
installable as a PWA (manifest + service worker, offline shell). Suggested fix:
delete "Capacitor.js hybrid mobile app and" everywhere; keep "responsive React.js
web application, installable as a Progressive Web App".
Scope §1.3.1 item 5 ("PWA will enable… without needing to download a separate
native app") is already correct — the architecture text contradicts the scope text.

### 1.3 Microservices / API Gateway — **[WRONG]** (Figure 3.1.1 paragraph)
Paper: "An API Gateway built with Node.js and Express validates the token, enforces
rate limits, and routes requests to the appropriate microservice."
Reality: one Express app (modular monolith); feature routers, no microservices.
Suggested replacement:
> A single Node.js/Express API (modular monolith) validates the Supabase JWT,
> enforces per-IP rate limits, and routes requests to feature modules
> (catalog, cart, orders, admin, content, audit, …).

### 1.4 "Supabase database on Oracle/Azure" — **[WRONG]** (Figure 3.1.1 paragraph)
Reality: Supabase is Supabase Inc.'s managed cloud (free tier). **Microsoft Azure**
is the host for the Node backend only (deployment guide `deploy/DEPLOY.md`, Azure VM).
Suggested replacement:
> Data is stored in a managed Supabase project (Postgres + Auth + storage, hosted by
> Supabase). The Node/Express backend is designed to deploy on a Microsoft Azure
> virtual machine running Docker Compose.

### 1.5 Service booking — **[WRONG] everywhere** (dropped by owner decision, commit `72cc6c5`)
Search the document for "booking", "book services", "schedule service", "approve bookings"
and remove or re-scope each hit:
- Abstract: "It also features service booking…" → delete that clause.
- §1.0: "browse products, book services, and receive tailored recommendations" → "browse products and receive tailored recommendations".
- §1.2.2 B: "browse pet supplies and services" → "browse pet supplies".
- §1.3.1 item 5 (PWA): "shop the inventory, schedule service, and receive…" → "shop the inventory and receive…".
- Use Case Diagram (Figure 3.3.6) + caption: remove "book services" (Customer) and "approve bookings" (Staff).
- DFD Figures 3.1.4/3.1.5 (Staff/Admin) + Agile "Development" paragraph ("booking system").
- Related-work sentences in Ch. II may stay (they motivate the original proposal).
Add one bullet to §1.3.2 Limitations:
> Service booking (grooming/vet appointments), originally proposed, was removed from
> the implemented scope after re-scoping with the shop owner; the implemented platform
> sells products only.

### 1.6 Review & Feedback module — **[STALE]** (DFD Figure 3.1.3, module 6.0)
Reality: reviews EXIST but narrower than the DFD implies. Customers rate products
(1–5 stars + comment) **from their own past orders** (My Orders page); one review per
product per order; re-submitting updates the row. There is no public display of
aggregate ratings on product pages yet.
Fix the DFD label/caption to "Product Review Module — customers submit ratings and
comments for products they purchased (order history)". Optionally add to Limitations:
"aggregate ratings are stored but not yet displayed on product cards (future work)".

### 1.7 Address Verification modules — **[WRONG]** (DFD 3.1.4 module 6.0, 3.1.5 "8.0 and 9.0")
Reality: there is no address-verification workflow. Shipping address is a free-text
field on the customer profile (single address column) used at checkout.
Remove the Address Verification modules from both DFDs; fold address editing into
"Profile Management" (Customer DFD) and drop it from Staff/Admin DFDs.

### 1.8 Sales DB (D2) for analytics — **[WRONG] + open decision** (DFD 3.1.5 module 3.0)
Reality: the `sales` table is seed-only with an approximate profit figure; live
analytics (dashboard, reports) compute from `orders` + `order_details` + `payment` +
`events`. Order lines carry exact `unit_price` / `unit_cost` snapshots, so margin is
computable per line.
Owner decision still pending — two options:
- **Option B (recommended):** reword the DFD to "Orders/Payments DB"; compute profit
  from cost snapshots; delete the `sales` table; remove "Sales DB" from the ERD.
- **Option A:** keep a `sales` table but write one row per completed order (code change;
  not built).
The paper must not describe a Sales DB as the analytics source either way.

### 1.9 "Secure payment processing" / payment gateway — **[STALE]** (Abstract IPO, Figure 2, Scope)
Reality: cashless payment runs through a **PayMongo seam**. The prototype ships a
simulated gateway — a hosted-checkout-style pay page plus an outcome callback — with the
same transition rules production will use: success → Processing + receipt (idempotent),
failure → order stays Pending, 30-minute payment window, expiry → cancelled + restocked
(see `backend/src/utils/gatewayPayment.js`). In production that step is PayMongo's
hosted checkout (GCash/Maya/cards) confirmed by its webhook, which is wired once the
system has a public HTTPS domain (`deploy/DEPLOY.md`). Cash on delivery stays as the
manual alternative. Suggested wording:
> Payment is processed through the PayMongo payment gateway (GCash, Maya, and cards via
> hosted checkout); orders not paid within 30 minutes are cancelled automatically and
> stock is restored. Cash on delivery remains available as a manual alternative. The
> prototype exercises the same integration seam through a built-in gateway simulation;
> the live webhook is enabled when the system is deployed to a public HTTPS domain.

### 1.10 "Real-time" claims — **[STALE]** (Abstract, Objectives E, Scope item 3)
Keep the feature, soften the word: "near-real-time (refreshed on load; ~30 s polling)".
Objective E ("real-time analytics and reporting") → "analytics and reporting dashboards
refreshed on load".

---

## 2. Diagrams to redraw (with target content)

### 2.1 Software Architecture (Figure 3.1.1)
Boxes: [React + Vite + Tailwind PWA] → HTTPS/REST + JWT → [Express modular monolith on
Microsoft Azure] → [Supabase: Postgres (RLS), Auth (GoTrue), Storage], [Brevo SMTP/API →
email (receipts, status, support replies, password reset)], and [PayMongo payment gateway →
GCash/Maya/cards; webhook confirms payment]. Include the supplied figure
`Downloads/architecture-diagram.png` (source: `docs/system-architecture.md`).
Kill Socket.IO, Capacitor, microservice arrows, and any claim that Supabase itself runs
on the Azure VM — Supabase is its own managed cloud; the VM hosts only the API and the
static frontend.

### 2.2 DFD Level 0 (Figure 3.1.2)
Add an external entity **Email provider (Brevo)** with flows: password-reset email,
order confirmation receipt, order-status updates, support replies.
Customer flow "receive product information and status updates" becomes true again via email.

### 2.3 DFD Level 1 — Customer (Figure 3.1.3)
Replace the six modules with what exists:
1.0 Authentication (register/login, GoTrue) → Accounts DB (profiles)
2.0 Catalog & Search (products, categories, brands, filters) → Products DB
3.0 Shopping Cart (qty, availability/price re-check) → Cart DB (cart_items)
4.0 Checkout & Orders (promo code, shipping fee/free-shipping rule, payment method,
    order + line snapshots + payment row) → Orders DB
5.0 Profile & Address (single address on profile) → Accounts DB
6.0 Pet Profiles & Recommendations (pet health data stored on the user's device;
    rule-based food matching) — not a server DB
7.0 Product Reviews (1–5 stars + comments on purchased products) → Feedback DB
8.0 Support Requests (open/reply thread) → Supports DB
Remove: standalone Payment-method-edit module (methods are shop-configured).

### 2.4 DFD Level 1 — Staff (Figure 3.1.4)
1.0 Authentication with step-up re-verification for sensitive writes
2.0 Order Management (status changes → customer email)
3.0 Product Management (no cost/supplier visibility for staff)
4.0 Payment Monitoring (read-only)
5.0 Support Replies (reply → customer email)
Remove bookings + address verification.

### 2.5 DFD Level 1 — Admin (Figure 3.1.5)
1.0 Authentication + step-up, 2.0 Role Management, 3.0 Analytics & Reporting
(orders/payments/events; profit from order_details cost snapshots — not Sales DB),
4.0 Order Management, 5.0 Product Management incl. cost/supplier, price history,
archive/restore, CSV import/export, 6.0 Support, 7.0 Payment Monitoring,
8.0 Promotions (codes: percent/fixed/free-shipping, scopes, limits, windows),
9.0 Content CMS (media library, banners/carousel, home sections, navigation &
category editor, FAQs, policy pages, site settings: shipping fee, free-shipping
threshold, payment methods + QR, maintenance mode), 10.0 Audit Logs (every admin
write + staff/admin sign-ins, plain-language entries with who/what/old→new).

### 2.6 ERD (Figure 3.3.5)
Old eight entities (Customer/Staff/Admin/Product/Order/Service/Payment/Pet Food
Recommendation) do not match the database. Redraw from the live schema:

| Group | Tables |
|---|---|
| Identity | `profiles` (one table; `role` ∈ user/staff/admin; address + contact as columns) |
| Catalog | `product` (incl. `description`, `details` jsonb, `cost_price`, `supplier`, `archived_at`), `product_price_history`, `site_categories` |
| Commerce | `cart_items`, `orders`, `order_details` (`unit_price`, `unit_cost`, `discount_amount` snapshots), `payment`, `feedback` |
| Growth | `promos`, `promo_usage`, `events`, `site_banner_events` |
| Content | `site_media`, `site_banners`, `site_home_sections`, `site_nav_items`, `site_faqs`, `site_policies`, `site_settings`, `site_content_history` |
| Governance | `audit_logs`, `supports` |
| Legacy | `sales` (seed-only — remove under Option B), `data_analytics` (dead, zero code refs — drop from diagram and DB) |

Relationship notes for the caption:
- Customer/Staff/Admin are one entity with a role attribute, not three tables.
- Address is a column set on `profiles`, not an entity. Pet profiles live in the
  browser (localStorage), not the database — show as an external actor-side store
  or omit with a note.
- No Service entity (booking dropped).
- All foreign keys are NO ACTION (no cascade deletes); `payment.order_id` currently
  has no FK constraint (convention only — add the constraint or note it).
- Verify the exact table list against Supabase → Table Editor before redrawing
  (~26 tables; drop `data_analytics` and any leftover `service`/`whiskers` probes).

### 2.7 Use Case Diagram (Figure 3.3.6)
- Customer: register/login, browse & search catalog, view product (details accordion,
  sale price), manage cart (recommendations strip), checkout (promo, shipping, QR/COD),
  view receipt + receive emails, order history, review purchased products, pet profiles
  & recommendations, support request, edit profile.
- Staff: login with step-up, manage products (limited fields), manage order status,
  monitor payments, reply to support.
- Admin: everything staff can do + manage roles, product costing & lifecycle, promotions,
  content (media/banners/sections/nav/FAQs/policies/settings), customers, analytics,
  audit logs.
- Remove: book services, approve bookings, address verification.

### 2.8 System flowcharts (Figures 3.3.4–3.3.6)
Caption text fix: "users are categorized as either administrators or standard customers"
→ three roles (Administrator, Staff, Customer). Customer path adds: sign-in required
before checkout (guests are asked to create an account), promo application, QR/COD
choice, email receipt.

---

## 3. Prose edits (wording-level)

| Location | Change |
|---|---|
| Abstract | Remove booking + Capacitor; soften "real-time"; payments wording per §1.9; add "content management, promotion codes, and an audit trail" to the staff/management sentence |
| §1.2.2 C | Now literally true (admin CMS: products, pricing, availability, promotions) — strengthen "ensure security" to "protected by role-based access and step-up re-authentication" |
| §1.2.2 F | Remove "(if applicable)" chatbot; FAQ answers are managed as content by admins (no chatbot) |
| §1.3.1 Scope item 1 | Add: multi-section product info (ingredients, feeding guide, analysis, storage) managed by admins |
| §1.3.1 Scope | Add items or a short "implemented beyond the original scope at the owner's request" list: promotion codes, content CMS (banners/home sections/navigation/FAQs/policies/site settings incl. free-shipping threshold and maintenance mode), audit trail with sign-in records, transactional email via Brevo, CSV product import/export |
| §1.3.2 Limitations | Add: booking removal (§1.5), SPA SEO limitation (per-product meta/OG not visible to crawlers; UUID URLs, no slugs — future work: edge-function share preview), account required to checkout, manual QR payment confirmation, aggregate ratings not publicly displayed |
| §1.4 Significance (Staff) | "quick posting of promotions" — now true; may cite the Promotions admin page |
| Agile "Development" paragraph | Remove "booking system" from the feature list |
| Figure 2 IPO prose | "secure payment processing" → payment wording per §1.9 |
| Definition of terms | Optional additions: Step-Up Authentication, Row-Level Security, Promotion Code, Audit Trail |

---

## 4. Screenshots section — re-shoot everything (all current figures are pre-redesign)

The UI changed substantially after the original screenshots (blue/yellow admin theme,
Things-style status pills, product page accordion, recommendations, promos, all Phase 5/6
admin pages). Minimum re-shoot list (~25 screens, desktop 1440 px + a few at 390 px):

Customer: Home (banner carousel + brand tiles + sections), Menu with filters, Product
detail (info accordion + sale badge + related), Cart (stock/price chips + recommendations
strip + totals), Checkout (promo field + payment QR options + free-shipping hint),
Order confirmation + official receipt, My Orders (with "Buy again" + review action),
Pets + recommendation results, Support page, Profile, Login modal, Step-up password modal,
Maintenance mode page ("We will be back soon"), PWA install/offline hint.

Admin: Dashboard (KPIs + charts incl. margin), Orders (status change, view modal with
per-line cost/margin), Products (cost fields, bulk actions, import/export, details
editor, duplicate), Payments ("Value in view"), Customers (role change), Promos,
Media library, Banners (placement tabs + reorder), Home Sections, Navigation (+ category
editor), Settings (store/FAQs/policies tabs), Audit Logs (plain-language day groups +
"What changed" panel).

**Renumbering:** the current numbering is broken — "Figure 3.2.8" appears 3×,
"3.2.9" 2×, "3.2.1" is used for both Website Features and Data Gathering, and
"3.3.5/3.3.6" are each used twice (flowcharts vs ERD/use case). Renumber sequentially
after the re-shoot.

---

## 5. Chapter IV fill-in (currently empty shells) — test evidence available

4.2 System Test Plan can cite the automated suite (run 2026-10-20):
- Backend unit/integration: **219 assertions, 0 failures** (`node --test`).
- Frontend unit: **314 tests, 0 failures** (Vitest, 32 files).
- End-to-end API walkthrough: **187/187 checks** (PowerShell suite: full customer journey,
  every admin page, role matrix incl. staff restrictions, step-up, promos, content CMS,
  audit trail, sign-in records, email skip-path, M2/M3/M4/M6 schema probes).
- Manual UX passes: 360×800 and 390×844 screenshot sweep (24 routes), zero horizontal
  overflow, loading/empty/error states, WCAG keyboard/focus checks on modals.
Map the questionnaire dimensions to ISO 25010 subcharacteristics (functional suitability,
performance, compatibility, usability, reliability, security, maintainability,
portability) using these results as objective evidence alongside the survey.

Honest test caveats to state (or hide by following the run procedure): the E2E suite
restarts nothing itself — the backend rate limiters are per-IP in-memory, so runs need a
backend restart first; the suite runs with an empty Brevo key so no real mail is sent.

4.3–4.4 (respondent profile, questionnaire, interpretation): team's survey work —
Cochran n≈300 plan unchanged.

Chapter V: team's writing; can cite the final numbers above and the honest limitation
list from §3.

---

## 6. Defense prep — discrepancy log (paper vs built system)

| # | Paper claim | Reality | Resolution in this checklist |
|---|---|---|---|
| 1 | Socket.IO real-time | Polling + 30 s cache | §1.1 reword / Future Work |
| 2 | Capacitor mobile app | Responsive PWA only | §1.2 delete |
| 3 | Microservices gateway | Modular monolith | §1.3 reword |
| 4 | Supabase on Oracle | Supabase cloud; Microsoft Azure = backend host plan | §1.4 reword (Oracle → Azure) |
| 5 | Service booking | Dropped by owner (Q3) | §1.5 remove + limitation |
| 6 | Review module (broad) | Order-history reviews; no public aggregate | §1.6 narrow |
| 7 | Address verification (staff/admin) | Free-text profile field only | §1.7 remove |
| 8 | Sales DB drives analytics | sales = seed-only fake profit; live = orders+payments+events | §1.8 Option A/B (owner) |
| 9 | Secure payment processing | PayMongo seam (simulated gateway; live webhook pending public domain) + COD | §1.9 reword |
| 10 | 8-entity ERD | ~26 tables, 1 roles table, pets on-device | §2.6 redraw |
| 11 | Chatbot (objective F, "if applicable") | FAQ content pages only | §3 soften |
| 12 | Guest checkout | Guests browse and fill a cart (kept on-device, merged on sign-in); an account is required to place the order | §3 limitation |
| 13 | SPA SEO / per-product meta | Client-side only; UUID URLs | §3 limitation (Q4) |
| 14 | Email notifications | Added via Brevo (owner-requested; receipts, status, support replies, password reset) | Abstract/DFD add (§2.2) |
| 15 | Promotion codes | Built (Phase 4) — beyond original scope | §3 scope add |
| 16 | Content CMS | Built (Phase 5/6) — banners, sections, nav, FAQs, policies, settings | §3 scope add |
| 17 | Audit trail + sign-in records | Built (owner-requested) | §2.5 module 10 |
| 18 | Money handling | PHP; numeric(12,2) money columns; ₱75 default shipping + free-shipping threshold (admin-editable) | mention in settings/analytics prose |
| 19 | Maintenance mode | Admin toggle gates the storefront | §4 screenshot + settings prose |
| 20 | `payment` FK | No DB constraint on payment.order_id | ERD caption note (§2.6) |

---

## 7. Suggested order of work (paper team)

1. Section 1 (wrong claims) — same-day text edits; no figures needed.
2. Redraw Figures 3.1.1–3.1.5, 3.3.5 (ERD), 3.3.6 (use case) per §2 — then update captions.
3. Re-shoot UI screenshots (§4) from the current build (frontend on :5173) — all admin
   pages need a staff/admin login; use the owner account.
4. Renumber every figure after the re-shoot.
5. Fill Chapter IV §4.2 with the test evidence (§5).
6. Final self-check — search the document for these words and confirm each remaining hit
   is intentional: `booking`, `book service`, `Socket.IO`, `Capacitor`, `microservice`,
   `Sales DB`, `Address Verification`, `approve booking`, `chatbot`, `real-time`.

Owner-only decisions still open: §1.8 Option A vs B (sales table), and whether promotion
codes / CMS / audit / email get presented as scope items or as "implemented at owner
request" additions.
