# ISO 25010 Survey Questionnaire — Whiskers Petshop

Three ready-to-build evaluation questionnaires based on **ISO/IEC 25010:2011** (SQuaRE — System and software quality models), written for the actual implemented system: the React PWA storefront, the staff/admin back office, and the codebase itself. Each question is written to look and behave like a Google Forms item, and an appendix maps every question to the exact ISO 25010 characteristic **and sub-characteristic** it measures.

| Form | Who answers it | Time | What it measures |
|------|----------------|------|------------------|
| **Form A** — Customer Quality Evaluation Survey | Customers / end users who browsed, ordered, or used the pet-profile recommendations | ~10 minutes | Product quality as experienced by users + Quality in use |
| **Form B** — Staff & Admin Panel Evaluation Survey | The shop owner, staff, and admins who use `/admin` daily | ~8 minutes | Back-office functional suitability, usability, reliability, security, performance |
| **Form C** — Developer Technical Self-Assessment | The 4-person dev team (anyone who reads or writes the code) | ~10 minutes | Maintainability, Compatibility, Portability + internal Security/Performance engineering |

> **ISO note:** ISO 25010 does not require a survey — it defines **what quality means**. A survey is the standard way a capstone turns that definition into measurable evidence: respondents rate statements, you compute the mean per characteristic, and you report the result in Chapter 4 as "the system's functional suitability rated *High* (M = 4.36)". Form A covers the **product quality model** (8 characteristics) plus **quality in use** (5 characteristics). Forms B and C cover the characteristics end users cannot see (back-office depth, and Maintainability / Compatibility / Portability).

**Standard used:** ISO/IEC 25010:2011 — 8 product-quality characteristics (*Functional suitability, Performance efficiency, Usability, Reliability, Security, Maintainability, Portability, Compatibility*) and 5 quality-in-use characteristics (*Effectiveness, Efficiency, Satisfaction, Freedom from risk, Context coverage*). If your panel requires the **2023** revision, see the note in Appendix 3 — only the names change, not the questions.

---

## How to build these in Google Forms (5 minutes)

1. Go to [forms.new](https://forms.new) → click **Add section** (⫲) wherever you see **── Section N ──** below.
2. Add each question with the question type named in bold. Rating statements are built as `Linear scale` 1→5 with labels `Strongly disagree` … `Strongly agree`, **plus** a separate `Multiple choice` "N/A" option is not possible on a linear scale — so for rating sections use **`Multiple choice` with five numbered choices and a "Not applicable / I haven't used this" choice** (this is the form used below, and it keeps N/A answers out of the mean).
3. Toggle **Required** on every question marked `✳ Required`.
4. In **Settings → Responses**: turn **Collect email addresses** OFF and **Limit to 1 response** OFF so answers stay honest and anonymous — say so in the description, as written below.
5. Add a **Confirmation message** per form, as written at the end of each form.
6. **Pilot first:** run each form past 3–5 people who did not help build the system. If they misread a question, reword it before the real deployment. Target at least **30 valid responses** for Form A so per-characteristic means are defensible in Chapter 4.

**Answer scale used throughout Forms A and B:**
`5 — Strongly agree` · `4 — Agree` · `3 — Neutral` · `2 — Disagree` · `1 — Strongly disagree` · `N/A — I haven't used this feature`

---

# 📋 FORM A — Customer Quality Evaluation Survey

**ISO/IE 25010:2011 · Product quality: Functional suitability, Performance efficiency, Usability, Reliability, Security · Quality in use: Effectiveness, Efficiency, Satisfaction, Freedom from risk, Context coverage**

> *About this survey · 48 questions · ~10 minutes*
> This survey is **anonymous** — we are not collecting your name, email, or IP address. There are no right or wrong answers; rate **how the Whiskers website actually behaved for you**, not how a shop website ought to behave. If you never used a feature, pick "N/A — I haven't used this feature" and it will simply be skipped in the results.
> To answer this survey you must have at least visited the Whiskers store, seen the product catalog, or received a recommendation for a pet.

---

## ── Section 1: Before you begin ──

**Q1 · Checkboxes · ✳ Required**
Please confirm before continuing:

- ☐ I understand this survey is anonymous and my individual answers will not be shared with anyone.
- ☐ I have actually used the Whiskers website (browsed products, used the pet profile, or placed an order).
- ☐ I will answer honestly, including about anything that frustrated me.

---

## ── Section 2: About you and how you used the system ──

**Q2 · Multiple choice · ✳ Required**
How often do you use the Whiskers website?

- ○ This was my first and only time
- ○ A few times a month
- ○ About once a week
- ○ Several times a week

**Q3 · Multiple choice · ✳ Required**
Which device did you mostly use it on?

- ○ Phone (mobile browser or installed app icon)
- ○ Laptop / desktop computer
- ○ Tablet
- ○ Roughly equal across phone and computer

**Q4 · Checkboxes · ✳ Required**
Which features did you actually use? *(Tick all that apply — this only tells us which questions are relevant for you)*

- ☐ Searching or filtering the product catalog
- ☐ Creating a pet health profile and viewing recommended products
- ☐ Adding items to the cart and changing quantities
- ☐ Checking out (delivery address, promo code, payment choice)
- ☐ Paying with GCash or Maya (QR transfer) or choosing Cash on Delivery
- ☐ Viewing my orders, order status, or the official receipt
- ☐ Rating a product I bought (stars + comment)
- ☐ Sending a message to customer support
- ☐ Editing my profile or resetting my password
- ☐ Using the site while offline or installing it on my phone (home-screen icon)
- ☐ Only browsing — I never signed in

**Q5 · Multiple choice · ✳ Required**
Do you own a pet?

- ○ Yes, and I filled out the pet health profile (species, life stage, health condition, allergies)
- ○ Yes, but I did not fill out the pet profile
- ○ No — I was shopping for someone else / for general browsing

---

## ── Section 3: Functional suitability ──
*Does the system have the right features, do they produce correct results, and are they helpful for shopping for pet supplies?*

**Q6 · Multiple choice ✳ Required — Functional completeness**
Everything a pet shop website should let me do is available on Whiskers (browse, search, cart, pay, track, get help).

- 5 — Strongly agree · 4 — Agree · 3 — Neutral · 2 — Disagree · 1 — Strongly disagree · N/A

**Q7 · Multiple choice ✳ Required — Functional completeness**
The features I needed to complete a purchase (from finding a product to seeing my order confirmation) were all there — I never hit a dead end.

- 5 … 1 · N/A

**Q8 · Multiple choice ✳ Required — Functional correctness**
Search and filters gave correct results — when I searched for a product or filtered by category, brand, or max price, the items shown matched what I asked for.

- 5 … 1 · N/A

**Q9 · Multiple choice ✳ Required — Functional correctness**
Prices, discounts, shipping fees, and totals shown in the cart and at checkout were correct (promo codes applied as promised; free-shipping threshold honoured).

- 5 … 1 · N/A

**Q10 · Multiple choice ✳ Required — Functional appropriateness**
The recommended products for my pet matched its profile — recommendations respected the pet's species, life stage, health condition, and allergies.

- 5 … 1 · N/A — I never used the pet profile

**Q11 · Multiple choice ✳ Required — Functional appropriateness**
The "reasons" shown with each recommendation (why it was chosen for my pet) were useful and made sense.

- 5 … 1 · N/A — I never used the pet profile

**Q12 · Multiple choice ✳ Required — Functional appropriateness**
The order history, status updates (Pending → Processing → Shipped → Delivered), tracking code, and receipt gave me the information I actually needed.

- 5 … 1 · N/A

**Q13 · Multiple choice ✳ Required — Functional completeness**
Customer support (the message thread under Support) let me raise a problem and get a reply without having to go through another channel.

- 5 … 1 · N/A — I never contacted support

---

## ── Section 4: Performance efficiency ──
*How fast and light does the system feel?*

**Q14 · Multiple choice ✳ Required — Time behaviour**
Pages loaded fast enough that I was not left waiting (home page, catalog, product details).

- 5 … 1 · N/A

**Q15 · Multiple choice ✳ Required — Time behaviour**
Searching and filtering the catalog responded immediately — results appeared as soon as I typed or changed a filter.

- 5 … 1 · N/A

**Q16 · Multiple choice ✳ Required — Time behaviour**
Product images loaded quickly, even on a slower mobile connection.

- 5 … 1 · N/A

**Q17 · Multiple choice ✳ Required — Time behaviour**
Placing an order (checkout → payment page → confirmation) completed without long waits at any step.

- 5 … 1 · N/A — I never ordered

**Q18 · Multiple choice ✳ Required — Capacity**
The site stayed responsive even during its busiest moments (e.g. sale periods, or when I opened many pages in a row).

- 5 … 1 · N/A — I can't tell

---

## ── Section 5: Usability ──
*Is the system easy to recognise, learn, and use — and does it protect you from your own mistakes?*

**Q19 · Multiple choice ✳ Required — Appropriateness recognisability**
From the first screen, it was obvious that Whiskers is a pet-supply store and what I could do there.

- 5 … 1

**Q20 · Multiple choice ✳ Required — Learnability**
As a first-time visitor, I figured out how to find a product and place an order without needing anyone to teach me.

- 5 … 1

**Q21 · Multiple choice ✳ Required — Learnability**
Filling out the pet health profile was straightforward — the dropdowns (species, life stage, health condition, allergies) were self-explanatory.

- 5 … 1 · N/A — I never used the pet profile

**Q22 · Multiple choice ✳ Required — Operability**
Moving around the site (home, catalog, cart, my orders, support, profile) was easy — I always knew where I was and how to get back.

- 5 … 1

**Q23 · Multiple choice ✳ Required — Operability**
The words and labels used on the site (buttons, statuses, payment instructions) were clear and easy to understand.

- 5 … 1

**Q24 · Multiple choice ✳ Required — User error protection**
The site helped me avoid mistakes — for example the option to undo after removing a cart item, quantity limits tied to actual stock, and validation of my delivery address before I could continue.

- 5 … 1 · N/A

**Q25 · Multiple choice ✳ Required — User error protection**
When something went wrong (out-of-stock item, wrong promo code, a failed step), the error message told me plainly what happened and what to do next.

- 5 … 1 · N/A — nothing ever went wrong

**Q26 · Multiple choice ✳ Required — User interface aesthetics**
The site looked clean, tidy, and pleasant to shop in — consistent colours, spacing, and layout across pages.

- 5 … 1

**Q27 · Multiple choice ✳ Required — User interface aesthetics**
The dark mode (night theme) was comfortable to read, and switching between light and dark worked as expected.

- 5 … 1 · N/A — I never used dark mode

**Q28 · Multiple choice ✳ Required — Accessibility**
The site was comfortable to use with my fingers on a phone — buttons were big enough to tap and nothing important was too small or hidden.

- 5 … 1 · N/A — I only used a computer

**Q29 · Multiple choice ✳ Required — Accessibility**
Text was readable (large enough, good contrast against the background), and the site could be operated from the keyboard / without a mouse if needed.

- 5 … 1 · N/A — I never tried this

---

## ── Section 6: Reliability ──
*Does it work when it should, survive interruptions, and recover?*

**Q30 · Multiple choice ✳ Required — Maturity**
The website worked without crashing, freezing, or showing broken/blank screens during my whole visit.

- 5 … 1

**Q31 · Multiple choice ✳ Required — Availability**
Whenever I wanted to use it (day, evening, weekend), the site was up and reachable.

- 5 … 1

**Q32 · Multiple choice ✳ Required — Fault tolerance**
When my internet connection dropped and came back, or when I closed and reopened the browser, my cart and my signed-in session were still intact.

- 5 … 1 · N/A — my connection never dropped

**Q33 · Multiple choice ✳ Required — Fault tolerance**
Opening the site with no internet showed a clear offline page instead of a confusing browser error.

- 5 … 1 · N/A — I never tried this

**Q34 · Multiple choice ✳ Required — Recoverability**
If a page failed to load (e.g. an error card with a Retry button), retrying brought it back without losing my work or having to start over.

- 5 … 1 · N/A — I never saw an error

---

## ── Section 7: Security ──
*Does the system keep your account, data, and money safe?*

**Q35 · Multiple choice ✳ Required — Confidentiality**
I am confident that my personal details (name, phone, address) and my order history are visible only to me and the shop — not to other customers.

- 5 … 1

**Q36 · Multiple choice ✳ Required — Confidentiality**
Signing up and signing in felt safe — the password rules were sensible, and I could reset my password through my own email.

- 5 … 1

**Q37 · Multiple choice ✳ Required — Integrity**
I trust that my order details (items, quantities, amounts paid) were recorded exactly as I submitted them and were not altered afterwards.

- 5 … 1 · N/A — I never ordered

**Q38 · Multiple choice ✳ Required — Integrity**
The official receipt / order confirmation matched what I actually paid.

- 5 … 1 · N/A — I never ordered

**Q39 · Multiple choice ✳ Required — Non-repudiation**
Because I can see my tracking code, order status, and receipt, both I and the shop can prove what was ordered and when — there is a clear record of every transaction.

- 5 … 1 · N/A — I never ordered

**Q40 · Multiple choice ✳ Required — Accountability**
It is clear which actions on my account are mine (orders I placed, reviews I wrote, messages I sent) — and no one else could act under my name.

- 5 … 1

**Q41 · Multiple choice ✳ Required — Authenticity**
The payment instructions (GCash / Maya QR, or Cash on Delivery) made it clear they came from the real Whiskers shop, and I was never asked to type my card number or share a password with anyone.

- 5 … 1 · N/A

---

## ── Section 8: Quality in use ──
*Using the system in real life: does it get the job done, save you effort, and leave you satisfied and safe?*

**Q42 · Multiple choice ✳ Required — Effectiveness**
I was able to complete everything I came to do (find the right food for my pet, order it, and follow it up) — completely and accurately.

- 5 … 1

**Q43 · Multiple choice ✳ Required — Efficiency**
Compared to the effort it should take, buying from Whiskers was quick — few steps, information pre-filled where possible, no unnecessary pages.

- 5 … 1

**Q44 · Multiple choice ✳ Required — Satisfaction**
Overall, I am satisfied with using the Whiskers website.

- 5 … 1

**Q45 · Multiple choice ✳ Required — Satisfaction**
I would recommend the Whiskers website to other pet owners.

- 5 … 1

**Q46 · Multiple choice ✳ Required — Freedom from risk**
Using the site exposed me to no avoidable risk: I never worried about wrong charges, leaked details, or losing my order without a trace.

- 5 … 1

**Q47 · Multiple choice ✳ Required — Context coverage**
The site worked fully on both my phone and my computer — no feature was missing or broken on one of them.

- 5 … 1 · N/A — I only used one device

**Q48 · Paragraph · Optional**
What is the **one thing** we should fix or add first to make the website better?

___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

> **End of Form A.** *Confirmation message: "Thank you! Your answers are anonymous and will be used to evaluate the Whiskers website against ISO 25010 software quality standards."*

---

# 📋 FORM B — Staff & Admin Panel Evaluation Survey

**ISO/IE 25010:2011 · Product quality as experienced by back-office users: Functional suitability, Performance efficiency, Usability, Reliability, Security**

> *About this survey · 27 questions · ~8 minutes*
> Answer for **how the `/admin` panels actually behave in daily use**, not how the spec says they should. If you never used a module (e.g. you never touch promos), pick "N/A — I haven't used this feature"; it will be skipped in the results.

**Answer scale:** `5 — Strongly agree` · `4 — Agree` · `3 — Neutral` · `2 — Disagree` · `1 — Strongly disagree` · `N/A — I haven't used this feature`

---

## ── Section 1: About you ──

**Q1 · Multiple choice · ✳ Required**
Which best describes your role?

- ○ Shop owner / Admin (I see everything: analytics, customers, promos, banners, settings, audit logs)
- ○ Staff (I handle orders, products, payments view, and support replies)
- ○ Both — I use staff and admin modules

**Q2 · Checkboxes · ✳ Required**
Which back-office modules do you use at least weekly? *(Tick all that apply)*

- ☐ Orders (status changes, search, bulk actions)
- ☐ Products (add/edit, stock, images, CSV import/export)
- ☐ Payments (view and filter payment records)
- ☐ Support (reading and replying to customer messages)
- ☐ Analytics dashboard (KPIs, revenue chart, conversion funnel)
- ☐ Customers (search, role changes, deletion)
- ☐ Promos (create/edit discount codes)
- ☐ Content: banners, home sections, navigation, media library
- ☐ Settings (payment methods, shipping fee, thresholds)
- ☐ Audit logs (reviewing who changed what)

**Q3 · Multiple choice · ✳ Required**
On what kind of device do you mainly work in the back office?

- ○ Desktop / laptop
- ○ Phone
- ○ Both roughly equally

---

## ── Section 2: Functional suitability (back office) ──

**Q4 · Multiple choice ✳ Required — Functional completeness**
The panels include every function I need to run the shop day to day — I never have to ask for a feature that is missing.

- 5 … 1 · N/A

**Q5 · Multiple choice ✳ Required — Functional correctness**
Order status changes (Pending → Processing → Shipped → Delivered, or Cancelled) are always recorded correctly, and the customer-facing order page shows the same status.

- 5 … 1 · N/A — I don't handle orders

**Q6 · Multiple choice ✳ Required — Functional correctness**
Stock levels, prices, and payment records I see in the panels match reality — I have never found a product shown "in stock" that was not, or a payment shown "Paid" that was not.

- 5 … 1 · N/A

**Q7 · Multiple choice ✳ Required — Functional appropriateness**
The search, filters, and sorting in the orders, payments, and product lists actually help me find a specific record quickly.

- 5 … 1 · N/A

**Q8 · Multiple choice ✳ Required — Functional completeness**
The analytics dashboard (KPI cards, revenue chart, conversion funnel, low-stock signals) gives me the numbers I need to make decisions.

- 5 … 1 · N/A — I don't have dashboard access

**Q9 · Multiple choice ✳ Required — Functional appropriateness**
Replies I send from the Support module reliably reach the customer (they confirm receiving them / the email is sent).

- 5 … 1 · N/A — I don't handle support

---

## ── Section 3: Performance efficiency (back office) ──

**Q10 · Multiple choice ✳ Required — Time behaviour**
Lists (orders, payments, products, customers, audit logs) load quickly, even when they contain hundreds of records.

- 5 … 1 · N/A

**Q11 · Multiple choice ✳ Required — Time behaviour**
Bulk actions (changing status of several orders at once, deleting several records) finish fast enough not to disrupt my work.

- 5 … 1 · N/A

**Q12 · Multiple choice ✳ Required — Time behaviour**
CSV import/export of products completes in a reasonable time for our catalog size.

- 5 … 1 · N/A — I never used CSV

---

## ── Section 4: Usability (back office) ──

**Q13 · Multiple choice ✳ Required — Learnability**
A new staff member could learn the order and support screens with little or no training.

- 5 … 1

**Q14 · Multiple choice ✳ Required — Operability**
Day-to-day operations are efficient: I can change an order's status, edit a product, or reply to a customer in a few clicks without hunting through menus.

- 5 … 1 · N/A

**Q15 · Multiple choice ✳ Required — Operability**
The layout adapts well to a phone — the mobile card views are usable, not a squeezed desktop table.

- 5 … 1 · N/A — I only use a desktop

**Q16 · Multiple choice ✳ Required — User error protection**
The panels protect me from destructive mistakes: risky actions (deleting orders or customers, bulk deletes) ask for confirmation, and I can restore archived content (media, banners, sections) when needed.

- 5 … 1 · N/A

**Q17 · Multiple choice ✳ Required — User error protection**
Before a sensitive action I am asked to re-enter my password (step-up verification) — this feels like a reasonable safeguard, not a nuisance that slows me down.

- 5 … 1

**Q18 · Multiple choice ✳ Required — Accessibility**
Statuses and warnings in the panels are readable at a glance — labels such as Paid/Pending/Failed and low-stock warnings are clear, and colour is not the only signal.

- 5 … 1 · N/A

---

## ── Section 5: Reliability (back office) ──

**Q19 · Multiple choice ✳ Required — Maturity**
The back office has not crashed, frozen, or lost my changes mid-task during normal use.

- 5 … 1

**Q20 · Multiple choice ✳ Required — Fault tolerance**
If a save or status update fails (e.g. connection problem), the panel tells me clearly and my previous data is kept — no half-applied changes.

- 5 … 1 · N/A — failures never happened

**Q21 · Multiple choice ✳ Required — Recoverability**
Content I deleted by mistake can be recovered (archive/restore, content history, restore-defaults) — or, where it cannot, that is clearly warned beforehand.

- 5 … 1 · N/A

**Q22 · Multiple choice ✳ Required — Availability**
The back office is available when I need to work — including evenings and weekends.

- 5 … 1

---

## ── Section 6: Security (back office) ──

**Q23 · Multiple choice ✳ Required — Confidentiality**
I trust that sensitive business information is restricted to the right people — for example, cost and margin data is not visible to staff accounts, and customer data is not visible to anyone without a role that needs it.

- 5 … 1

**Q24 · Multiple choice ✳ Required — Accountability**
The audit log correctly records who changed what (e.g. "You changed an order's status from Processing to Shipped") — I can always trace an action back to a person.

- 5 … 1 · N/A — I never opened audit logs

**Q25 · Multiple choice ✳ Required — Authenticity**
I am confident only authorized people can enter the back office — role checks and the re-login (step-up) prompt effectively keep other people out.

- 5 … 1

**Q26 · Multiple choice ✳ Required — Integrity**
I have never seen back-office data change on its own — no order, payment, or product record was altered without someone acting on it.

- 5 … 1

**Q27 · Paragraph · Optional**
What is the **one back-office feature or behaviour** you would fix first?

___________________________________________________________________________
___________________________________________________________________________

> **End of Form B.** *Confirmation message: "Thank you — your answers feed directly into the system's quality evaluation and improvement backlog."*

---

# 📋 FORM C — Developer Technical Self-Assessment

**ISO/IE 25010:2011 · Product quality: Maintainability, Compatibility, Portability, Security (internal view) · Engineering practices behind the measured quality**

> *About this survey · 24 questions · ~10 minutes*
> This form is answered by the developers, using the repository as evidence — not opinion. Every "Agree/Disagree" statement below names a concrete artefact that exists in the codebase today (tests, Dockerfiles, encryption utilities, docs). Where a statement describes something **not yet built**, answer honestly — a gap recorded now is exactly what the improvement chapter needs.

**Answer scale:** `5 — Strongly agree` · `4 — Agree` · `3 — Neutral` · `2 — Disagree` · `1 — Strongly disagree` · `N/A`

---

## ── Section 1: Maintainability ──
*How easy is the code to understand, change, and verify?*

**Q1 · Multiple choice ✳ Required — Modularity**
The backend is organised as separate feature modules (routes for auth, profile, cart, products, orders, support, admin…), so changing one feature rarely risks breaking another.

- 5 … 1

**Q2 · Multiple choice ✳ Required — Modularity**
The frontend is split into per-page components (lazy-loaded routes) and shared components, so a change in one page does not ripple across the app.

- 5 … 1

**Q3 · Multiple choice ✳ Required — Reusability**
Shared logic (recommendation engine, address validation, promo engine, audit helpers, CSV product library) lives in reusable modules instead of being copy-pasted into each screen.

- 5 … 1

**Q4 · Multiple choice ✳ Required — Analysability**
A new developer can understand a piece of the system quickly: `README.md`, `DESIGN.md`, env templates with comments, and API docs make the code easy to locate and grasp.

- 5 … 1

**Q5 · Multiple choice ✳ Required — Analysability**
When the system fails in production, the logs (structured pino logs, masked emails, generic 500 responses) give enough information to diagnose the problem without exposing secrets.

- 5 … 1

**Q6 · Multiple choice ✳ Required — Modifiability**
Adding a new feature (e.g. a new admin module or a new product filter) requires touching a small, predictable set of files (route + page + tests) rather than the whole system.

- 5 … 1

**Q7 · Multiple choice ✳ Required — Testability**
The system is well covered by automated tests (backend unit tests, frontend tests, and a 37-check end-to-end API suite) that can be run on demand without manual setup.

- 5 … 1

**Q8 · Multiple choice ✳ Required — Testability**
Important logic (recommendations, promos, encryption, address rules, permissions) is testable in isolation, without needing the live UI or a real payment.

- 5 … 1

---

## ── Section 2: Compatibility ──
*How well does the system interoperate with its neighbours and coexist on a shared machine?*

**Q9 · Multiple choice ✳ Required — Interoperability**
The frontend and backend exchange data cleanly through documented REST/JSON endpoints with a consistent auth scheme (JWT bearer tokens).

- 5 … 1

**Q10 · Multiple choice ✳ Required — Interoperability**
External services integrate cleanly where used: Supabase (Postgres + Auth), Brevo (receipt / status / support-reply emails), and the GCash/Maya QR payment flow.

- 5 … 1

**Q11 · Multiple choice ✳ Required — Interoperability**
Data formats move between tools without manual fixing — e.g. product CSV import/export round-trips correctly, and Philippine address data is shared between checkout and profile.

- 5 … 1 · N/A

**Q12 · Multiple choice ✳ Required — Co-existence**
The system runs alongside other software on the same machine without conflicts — distinct ports (4141 backend, 5173 frontend), no global state, and it starts and stops cleanly (graceful shutdown, health endpoint).

- 5 … 1 · N/A

---

## ── Section 3: Portability ──
*How easily can the system be installed, adapted, and moved?*

**Q13 · Multiple choice ✳ Required — Installability**
A new machine can run the system from a clean clone using only documented steps (env templates, `install.bat`/`start.bat`, `npm run dev:local`, or `docker compose up --build`).

- 5 … 1

**Q14 · Multiple choice ✳ Required — Installability**
End users can install the storefront on their phone as a Progressive Web App (home-screen icon, offline shell) without an app store.

- 5 … 1 · N/A — I never tested this on a device

**Q15 · Multiple choice ✳ Required — Adaptability**
The same codebase adapts to different environments through configuration alone (`.env` values for Supabase keys, API base, proxy target, email keys, step-up TTL) — no code edits needed to move hosts.

- 5 … 1

**Q16 · Multiple choice ✳ Required — Adaptability**
The UI adapts to different user contexts without changes: phone vs desktop layouts, light vs dark theme, and reduced-motion/focus behaviour.

- 5 … 1

**Q17 · Multiple choice ✳ Required — Replaceability**
Where a component must be swapped (hosting target, email provider, payment flow), the surrounding architecture does not lock us in — the seams are clear (env-driven config, small utility modules such as the mailer and payment simulation).

- 5 … 1

---

## ── Section 4: Security & performance engineering (internal view) ──

**Q18 · Multiple choice ✳ Required — Confidentiality**
Sensitive personal data (email, first/last name, phone) is encrypted at the field level (AES-256-GCM) in the database, and secrets live only in env vars — never in the repo.

- 5 … 1

**Q19 · Multiple choice ✳ Required — Authentication / defence in depth**
Defence in depth is in place: Supabase row-level security, server-side role checks, HMAC step-up tokens (5-minute TTL) on every state-changing back-office request, and per-IP rate limits on sensitive endpoints (login, signup, orders, reviews).

- 5 … 1

**Q20 · Multiple choice ✳ Required — Integrity**
Server-side re-validation protects data integrity: checkout re-checks prices and stock on the server, uploads are re-encoded with sharp against a type/size whitelist, and admin writes are logged to the audit trail.

- 5 … 1

**Q21 · Multiple choice ✳ Required — Hardening**
The HTTP surface is hardened: strict CSP and security headers (helmet), CORS limited to the known origin, JSON body limits, generic 500 responses, and no `x-powered-by`.

- 5 … 1

**Q22 · Multiple choice ✳ Required — Time behaviour (engineering)**
Frontend performance work is real and measurable: route-level code splitting, catalog/search caching, Workbox offline caching, and server-side pagination.

- 5 … 1

**Q23 · Multiple choice ✳ Required — Observability**
We can tell whether the system is healthy in production: a `/health` endpoint, structured request logs, and a documented check (`npm run doctor`) plus test gates (backend, frontend, E2E) before release.

- 5 … 1

**Q24 · Paragraph · ✳ Required**
Name the **biggest quality risk** you know of in the current codebase (maintainability, compatibility, portability, security, or performance) and what you would do about it with one sprint of time.

___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

> **End of Form C.** *Confirmation message: "Thank you — this assessment becomes evidence for the quality evaluation chapter and the improvement backlog."*

---

# Appendix 1 — Question-to-ISO 25010 mapping

Use this table in your capstone paper (Chapter 4) as the justification for each survey item: every question measures a defined sub-characteristic of the standard.

## Form A mapping (customers)

| ISO 25010 characteristic | Sub-characteristic measured | Form A questions |
|--------------------------|-----------------------------|------------------|
| **Functional suitability** | Functional completeness | Q6, Q7, Q13 |
| | Functional correctness | Q8, Q9 |
| | Functional appropriateness | Q10, Q11, Q12 |
| **Performance efficiency** | Time behaviour | Q14, Q15, Q16, Q17 |
| | Capacity | Q18 |
| **Usability** | Appropriateness recognisability | Q19 |
| | Learnability | Q20, Q21 |
| | Operability | Q22, Q23 |
| | User error protection | Q24, Q25 |
| | User interface aesthetics | Q26, Q27 |
| | Accessibility | Q28, Q29 |
| **Reliability** | Maturity | Q30 |
| | Availability | Q31 |
| | Fault tolerance | Q32, Q33 |
| | Recoverability | Q34 |
| **Security** | Confidentiality | Q35, Q36 |
| | Integrity | Q37, Q38 |
| | Non-repudiation | Q39 |
| | Accountability | Q40 |
| | Authenticity | Q41 |
| **Quality in use — Effectiveness** | Accuracy & completeness | Q42 |
| **Quality in use — Efficiency** | Time/economy of effort | Q43 |
| **Quality in use — Satisfaction** | Usefulness, trust, comfort | Q44, Q45 |
| **Quality in use — Freedom from risk** | Economic, health-and-safety, IT-security risk | Q46 |
| **Quality in use — Context coverage** | Completeness in context, flexibility | Q47 |

*Maintainability, Compatibility, and Portability are **not** surveyed in Form A on purpose — end users cannot observe them. They are covered by Form C.*

## Form B mapping (staff & admin)

| ISO 25010 characteristic | Sub-characteristic | Form B questions |
|--------------------------|--------------------|------------------|
| **Functional suitability** | Completeness / correctness / appropriateness | Q4–Q9 |
| **Performance efficiency** | Time behaviour | Q10, Q11, Q12 |
| **Usability** | Learnability, operability | Q13, Q14, Q15 |
| | User error protection, accessibility | Q16, Q17, Q18 |
| **Reliability** | Maturity, fault tolerance, recoverability, availability | Q19–Q22 |
| **Security** | Confidentiality, accountability, authenticity, integrity | Q23–Q26 |

## Form C mapping (developers)

| ISO 25010 characteristic | Sub-characteristic | Form C questions |
|--------------------------|--------------------|------------------|
| **Maintainability** | Modularity | Q1, Q2 |
| | Reusability | Q3 |
| | Analysability | Q4, Q5 |
| | Modifiability | Q6 |
| | Testability | Q7, Q8 |
| **Compatibility** | Interoperability | Q9, Q10, Q11 |
| | Co-existence | Q12 |
| **Portability** | Installability | Q13, Q14 |
| | Adaptability | Q15, Q16 |
| | Replaceability | Q17 |
| **Security** | Confidentiality, integrity, authentication | Q18, Q19, Q20, Q21 |
| **Performance efficiency** | Time behaviour (engineering) | Q22 |
| **Reliability** | Observability/diagnosability | Q23 |

---

# Appendix 2 — How to score and report the results

### Step 1 — Clean the data

- Export the Google Forms responses to a spreadsheet.
- Replace every `N/A` cell with **blank** — N/A answers are excluded from means (a respondent who never used the pet profile must not drag Q10–Q11 down).
- Discard responses where Q1 (Form A) or any required consent item was not agreed, and responses that picked the same option on 100% of items straight down the page (straight-lining).

### Step 2 — Compute per-item and per-characteristic means

For each question compute the **weighted mean (M)** and **standard deviation (SD)** of the numeric answers (5–1). Then average the item means within each characteristic to get the **characteristic score**:

| Characteristic | Form A items |
|----------------|--------------|
| Functional suitability | Q6–Q13 |
| Performance efficiency | Q14–Q18 |
| Usability | Q19–Q29 |
| Reliability | Q30–Q34 |
| Security | Q35–Q41 |
| Effectiveness (QoU) | Q42 |
| Efficiency (QoU) | Q43 |
| Satisfaction (QoU) | Q44, Q45 |
| Freedom from risk (QoU) | Q46 |
| Context coverage (QoU) | Q47 |

### Step 3 — Interpret with these bands

These are the conventional 5-point interpretation bands used in Philippine capstone research; they map cleanly onto ISO 25010's "quality requirement met / partially met / not met" logic:

| Weighted mean | Verdict | What it means in the paper |
|---------------|---------|----------------------------|
| 4.20 – 5.00 | **Excellent** (Quality requirement fully met) | Characteristic is a strength — cite it as evidence of quality |
| 3.40 – 4.19 | **Very good** (Largely met) | Minor improvements only |
| 2.60 – 3.39 | **Good** (Partially met) | Partially met — list concrete fixes |
| 1.80 – 2.59 | **Fair** (Not met) | **Weakness — must appear in the recommendations chapter** |
| 1.00 – 1.79 | **Poor** (Seriously not met) | Redesign priority |

### Step 4 — Red flags that override the averages

- Any **item** with M < 3.00 inside an otherwise "Excellent" characteristic is a finding — report it individually, not averaged away.
- In Form A, **Q46 (Freedom from risk) below 3.40** is a trust problem, not a polish problem — treat it as priority #1.
- In Form B, **Q17 (step-up friction) below 3.00** signals the security safeguard is being resented; fix the UX before users start routing around it.
- In Form C, any "1 — Strongly disagree" on Q18–Q21 is a **security defect**, not an opinion — log it as an issue immediately.

### Step 5 — Report it in Chapter 4

Present one table per form: *Characteristic | No. of items | Weighted Mean | SD | Verdict*, plus a short paragraph per characteristic quoting the highest- and lowest-scoring items. Attach 2–3 anonymised comments from the final open question to justify the top recommendations. Re-run Form A every time a major feature ships — the before/after means are your evidence of **continual improvement**.

**Sample write-up sentence:**
> "As Table 4 shows, Functional Suitability obtained a weighted mean of 4.36 (SD = 0.58), interpreted as Excellent. The highest-rated item was the correctness of search and filtering (M = 4.51), while the lowest was the relevance of pet-profile recommendations (M = 4.02), which the team will address by expanding the recommendation rule set in the next iteration."

---

# Appendix 3 — If your panel requires ISO/IEC 25010:2023

The 2023 revision of the standard keeps every question above valid but renames and reorganises some characteristics:

| 2011 name (used in this document) | 2023 equivalent | Question impact |
|-----------------------------------|-----------------|-----------------|
| Usability | **Interaction capability** | None — sub-characteristics (learnability, operability, accessibility…) carry over |
| Maintainability | **Flexibility** + maintainability retained | None — Q1–Q8 stay valid |
| Security | **Security** (with IT-security-risk moved into quality in use) | None |
| Freedom from risk | Freedom from risk (**now explicitly includes IT security risk**) | Q46 becomes even more central — keep it |
| *(new)* | **Flexibility** (appropriateness recognisability, scalability, installability…) | Covered by Form C Q15–Q16 |

**Recommendation:** label your instrument **"ISO/IEC 25010:2011"** in the paper (the version used by the overwhelming majority of comparable e-commerce studies and the version this questionnaire was written against), and add one footnote citing the 2023 revision if a panelist asks. Cross-check any exact clause wording against your official copy of the standard before final submission — the characteristic and sub-characteristic names above are authoritative; page references should come from your own copy.
