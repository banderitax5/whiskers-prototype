# PayMongo integration — what is built and how to test it

Status: **code complete, verified in simulated mode only.** No PayMongo account
has been connected yet, so nothing has been charged and no real webhook has
arrived. Everything below is the procedure to prove it live.

## 1. What changed

| Area | Behaviour |
| --- | --- |
| `backend/src/utils/payMongo.js` | Checkout Session creation (`POST /v2/checkout_sessions`), webhook signature verification (HMAC-SHA256 over `"{t}.{rawBody}"`, `te`/`li`), amount + method helpers. Inert while `PAYMONGO_SECRET_KEY` is unset. |
| `backend/src/routes/payments.js` | `POST /api/payments/paymongo/webhook` — mounted **before** `express.json()` so the raw body survives signature verification. 401 on bad signature, 200 for events we cannot act on, 500 only for transient errors (so PayMongo retries). |
| `backend/src/utils/gatewayPayment.js` | `settleGatewayPayment()` — one success transition shared by the simulated callback and the webhook: claim order, mark payment paid, email receipt, clear cart. Idempotent (`neq status=succeeded` guards the receipt to exactly one send). `cancelGatewayOrder()` for when a session cannot be created. |
| `backend/src/routes/orders.js` | GCash/Maya orders get PayMongo's `checkout_url` when configured; if the session cannot be created the order is cancelled + restocked and the shopper gets a 502. The simulate endpoint is **closed** while PayMongo is configured. New `POST /api/orders/:id/payment-session` reopens a checkout for a pending order (closed tab / failed attempt). |
| `frontend/src/pages/Checkout.jsx` | Full-page redirect for external gateway URLs (SPA `navigate` for the simulated page). |
| `frontend/src/pages/OrderConfirmation.jsx` | On return from PayMongo (`?payment=paymongo`) shows "Confirming your payment…" and polls the order every 3 s for up to ~60 s; a fresh "Complete payment" button resumes payment. |

Storefront payment methods are unchanged: **GCash and Maya** only (no card
option is offered). PayMongo's hosted page shows only the method the order was
placed with.

## 2. What you must do in PayMongo

Test mode first. **Do not paste keys into chat.**

1. Create/confirm the PayMongo account and open **Developers → API keys**.
2. Copy the **test mode secret key** (`sk_test_...`).
3. Register the webhook (Dashboard → **Developers → Webhooks → Add endpoint**):
   - URL: `https://whiskerspet.me/api/payments/paymongo/webhook`
   - Event: **`checkout_session.payment.paid`** (this is the only event the
     code handles; no other webhook needs to be enabled)
   - Copy the generated **signing secret** (`whsec_...`).
   Alternatively, create it with the API (the response contains `secret`):
   ```bash
   curl -u sk_test_XXXX: https://api.paymongo.com/v1/webhooks \
     -H "Content-Type: application/json" \
     -d '{"data":{"attributes":{"url":"https://whiskerspet.me/api/payments/paymongo/webhook","events":["checkout_session.payment.paid"]}}}'
   ```
4. Test and live endpoints have **different signing secrets**. When you switch
   to `sk_live_...`, register a second endpoint (or update the secret) and
   replace `PAYMONGO_WEBHOOK_SECRET`.

## 3. Environment (on the server, `~/whiskers/backend/.env`)

```bash
PAYMONGO_SECRET_KEY=sk_test_...      # never commit; never paste in chat
PAYMONGO_WEBHOOK_SECRET=whsec_...
PUBLIC_SITE_URL=https://whiskerspet.me
GATEWAY_TTL_MINUTES=10               # demo-friendly; 30 is the default
```

Keep PayMongo unset on your local machine and for the E2E suite: the tests rely
on the simulated pay page, and a configured key closes that endpoint.

## 4. Deploy and smoke-test

```bash
cd ~/whiskers && git pull && docker compose build --pull && docker compose up -d
```

Then, signed in as a normal user:

1. Add an item with a real price and stock, choose **GCash** (or Maya) at
   checkout, place the order.
2. You should be redirected to `checkout.paymongo.com`. In test mode, complete
   the GCash/Maya sandbox flow (the test page lets you authorize the payment).
3. PayMongo redirects back to `/orders/<id>?payment=paymongo` — the page shows
   "Confirming your payment…" until the webhook lands, then the order flips to
   **Processing**, the receipt email arrives, and the cart clears.
4. Confirm the webhook delivery in PayMongo → Developers → Webhooks → the
   endpoint's event log (HTTP 200).
5. Admin → Orders should show the order as paid; Audit Logs should contain a
   "PayMongo payment confirmed" entry from `system`.

Failure paths already handled: cancel at PayMongo (order stays Pending until
`GATEWAY_TTL_MINUTES`, then is cancelled and restocked), session creation
failure (order cancelled immediately, 502 shown, stock returned), webhook
replayed (idempotent, no second receipt), amount mismatch (not fulfilled,
audit-logged), payment arriving after cancellation (payment recorded as
succeeded + audit entry "refund required", nothing restocked).

## 5. Verified so far (no PayMongo account)

- Backend unit tests **250/250** (14 new PayMongo tests: centavos, payload,
  method mapping, HMAC vectors, tampering, stale timestamps, provider errors).
- Frontend **339/339**, eslint clean, production build OK (PWA 53 precache).
- E2E **191/191** with PayMongo unconfigured (simulated path unchanged).
- Live webhook probe on a test-configured instance: no signature → 401, bad
  signature → 401, stale timestamp → 401, live signature against test secret →
  401, valid signature + unknown order → 200 `ignored`.

## 6. Known limitations

- Only GCash and Maya; card payments need a storefront payment method plus a
  PayMongo `card` mapping (not built).
- Refunds are not automated — a paid-after-cancel or overpaid order is flagged
  in the audit log for manual handling in the PayMongo dashboard.
- The E2E suite cannot cover the live gateway (needs an account + public
  webhook URL); it tests the shared settle logic through the simulated path.
