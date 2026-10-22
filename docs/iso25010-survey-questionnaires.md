# ISO 25010 Survey Questionnaires — Whiskers Petshop

Two ready-to-build questionnaires for the evaluation described in the capstone paper, *"Development and Implementation of a Cross-Platform Ecosystem for Whiskers Petshop with Data Analytics."* Each question is written to look and behave exactly like a Google Forms item, and an appendix maps every question to the **ISO/IEC 25010:2011 (SQuaRE)** quality characteristic and sub-characteristic it measures.

| Form | Who answers it | Time to finish | Purpose |
|------|----------------|----------------|---------|
| **Form N** — System Evaluation Questionnaire for Non-IT Respondents | Customers of Whiskers Petshop, store staff, and other non-technical end users (Chapter IV §4.3.1 target respondents) | ~10 minutes | Measure perceived quality of the system from the point of view of everyday users |
| **Form T** — System Evaluation Questionnaire for IT Experts | IT professionals, developers, IT faculty/panelists, technically skilled evaluators | ~15 minutes | Measure the same quality characteristics at a technical/architectural depth |

> **ISO note:** ISO/IEC 25010 rates software on **eight product-quality characteristics** — functional suitability, performance efficiency, compatibility, usability, reliability, security, maintainability, portability — each broken into sub-characteristics, plus a separate **quality-in-use** model (effectiveness, efficiency, satisfaction, freedom from risk, context coverage). Both forms cover all eight characteristics so the results tables in Chapter IV can present the same eight dimensions for each respondent group; the difference is only in **depth and wording**. Non-IT respondents answer from what they experience; IT experts answer from inspection and technical judgment.

**System features these forms evaluate (per the paper's scope):** e-commerce catalog with product descriptions, prices, and stock availability; **Pet Food Recommendation System** driven by pet health conditions and prescriptions; **real-time content management** for staff/admin (listings, pricing, availability, promotions); **shopping cart, checkout, payment recording, and receipts**; **order management** (customer, staff, admin views); **product reviews and feedback**; **customer support and FAQs**; **service booking**; **data analytics and reporting** (sales performance, product trends, inventory movement, customer buying habits); **role-based accounts** (Customer, Staff, Admin); and a **cross-platform experience** — responsive React.js web app installable as a PWA, on web and mobile devices.

---

## How to build these in Google Forms (5 minutes)

1. Go to [forms.new](https://forms.new) → click **Add section** (⫲) wherever you see **── Section N ──** below.
2. Add each question with the question type named in bold (e.g. `Linear scale 1–5`, `Multiple choice`, `Checkboxes`, `Paragraph`).
3. Toggle **Required** on every question marked `✳ Required`.
4. For `Linear scale 1–5` questions, set the labels: `1 = Strongly disagree` · `2 = Disagree` · `3 = Neutral` · `4 = Agree` · `5 = Strongly agree` (exactly as printed on each item below).
5. In **Settings → Responses**: turn **Collect email addresses** OFF for anonymous results; state so in the form description, as written below.
6. Add a Confirmation message (given at the end of each form).

**Answer scale used throughout:** `Linear scale 1–5` · 1 = Strongly disagree · 2 = Disagree · 3 = Neutral · 4 = Agree · 5 = Strongly agree — scored by **weighted mean** in §4.4 of the paper.

---

# 📋 FORM N — System Evaluation Questionnaire (Non-IT Respondents)

**ISO/IEC 25010:2011 · Functional suitability · Performance efficiency · Compatibility · Usability · Reliability · Security · Portability · Quality in use**

> *About this survey · 38 questions · ~10 minutes*
> Thank you for evaluating the **Whiskers Petshop** online platform. This survey is **anonymous** — we are not collecting your name or email. There are no right or wrong answers; we want your honest experience so we can improve the system. Answers will be reported only in totals.
> Rate each statement from **1 = Strongly disagree** to **5 = Strongly agree**. If something does not apply to you, choose **N/A** where it is offered.

---

## ── Section 1: Before you begin ──

**Q1 · Checkboxes · ✳ Required**
Please confirm before continuing:

- ☐ I understand this survey is anonymous and my individual answers will not be shared with anyone.
- ☐ I have used the Whiskers Petshop system (browsed products, booked a service, placed an order, or worked with it as staff).

**Q2 · Multiple choice · ✳ Required**
How often do you use the Whiskers Petshop system?

- ○ First time / I only looked briefly
- ○ Once in a while (a few times a year)
- ○ Monthly
- ○ Weekly or more often

---

## ── Section 2: Respondent profile (§4.3.1) ──

**Q3 · Multiple choice · ✳ Required**
Which group do you belong to?

- ○ Customer of Whiskers Petshop
- ○ Store staff / Employee
- ○ Store owner / Management
- ○ Other: __________

**Q4 · Multiple choice · ✳ Required**
Which device do you mainly use to access the system?

- ○ Mobile phone
- ○ Tablet
- ○ Laptop / desktop computer
- ○ I use more than one regularly

**Q5 · Multiple choice · ✳ Required**
How would you describe your comfort with websites and online apps?

- ○ Very comfortable — I use them often
- ○ Fairly comfortable — I manage, but I'm not fast
- ○ Not very comfortable — I need help sometimes
- ○ This was my first time doing anything like this

**Q6 · Multiple choice · ✳ Required**
Do you work in, or study, information technology (IT / computer science)?

- ○ No
- ○ Studying IT / computer science
- ○ Yes — I work in IT *(if yes, please answer **Form T** instead)*

---

## ── Section 3: What the system does (Functional suitability) ──

**Q7 · Linear scale 1–5 · ✳ Required**
The system has all the features I need: browse products, view descriptions and prices, check availability, manage a cart, and place an order.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q8 · Linear scale 1–5 · ✳ Required**
The Pet Food Recommendation System suggests food that fits my pet's health condition, allergies, and dietary needs.
`1 = Strongly disagree` … `5 = Strongly agree` · ○ N/A — I have not used the recommendations

**Q9 · Linear scale 1–5 · ✳ Required**
The information shown (product price, stock availability, promotions, receipt details) is accurate — what I see is what I get.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q10 · Linear scale 1–5 · ✳ Required**
The service booking feature lets me schedule grooming/veterinary services correctly and shows my booking back to me.
`1 = Strongly disagree` … `5 = Strongly agree` · ○ N/A — I have not booked a service

**Q11 · Linear scale 1–5 · ✳ Required**
The data analytics and reports (sales performance, product trends, inventory movement, buying habits) give correct and useful figures for decision-making.
`1 = Strongly disagree` … `5 = Strongly agree` · ○ N/A — I cannot see the reports (customers)

**Q12 · Checkboxes · ✳ Required**
Which features worked exactly as you expected? *(Tick all that apply)*

- ☐ Searching / browsing the product catalog
- ☐ Product details (description, price, stock)
- ☐ Shopping cart and checkout
- ☐ Payment recording and official receipt
- ☐ Pet food recommendations
- ☐ Service booking
- ☐ Product reviews and feedback
- ☐ Support / FAQ pages
- ☐ Promotions and availability updates
- ☐ Admin/staff: product, inventory, and order management
- ☐ Admin: analytics dashboard and reports
- ☐ None of these worked properly

---

## ── Section 4: Speed and responsiveness (Performance efficiency) ──

**Q13 · Linear scale 1–5 · ✳ Required**
Pages and product listings open quickly enough — I am not left waiting or staring at a spinner.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q14 · Linear scale 1–5 · ✳ Required**
Search, filters, and category browsing respond quickly after I click.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q15 · Linear scale 1–5 · ✳ Required**
The system stays fast when there are many products, many orders, or several people using it at the same time (stock and price updates appear without noticeable delay).
`1 = Strongly disagree` … `5 = Strongly agree`

**Q16 · Multiple choice · ✳ Required**
The longest you have waited for a page to load before giving up:

- ○ I never had to wait noticeably
- ○ A few seconds
- ○ Around 10–30 seconds
- ○ More than 30 seconds — I left the page

---

## ── Section 5: Works on your device (Compatibility) ──

**Q17 · Linear scale 1–5 · ✳ Required**
The system works correctly on the devices and browsers I use (phone, tablet, computer — no conflicts or failures between them).
`1 = Strongly disagree` … `5 = Strongly agree`

**Q18 · Checkboxes · ✳ Required**
Did you notice any of these? *(Tick all that apply)*

- ☐ Nothing — the layout always looked right
- ☐ Text or images overlapping or cut off
- ☐ Buttons too small to tap on mobile
- ☐ Broken or missing images
- ☐ The page looked confusingly different from one device to another
- ☐ I had to zoom in a lot to read or tap things

**Q19 · Linear scale 1–5 · ✳ Required**
The system works together smoothly with the other parts it depends on — the mobile and web versions behave the same way, and the payment process connects correctly with the order records.
`1 = Strongly disagree` … `5 = Strongly agree`

---

## ── Section 6: Ease of use (Usability) ──

**Q20 · Linear scale 1–5 · ✳ Required**
The system was easy to learn — I did not need anyone to guide me through it.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q21 · Linear scale 1–5 · ✳ Required**
I could always find what I was looking for (navigation, menus, categories, and the FAQ page are clear).
`1 = Strongly disagree` … `5 = Strongly agree`

**Q22 · Linear scale 1–5 · ✳ Required**
When something goes wrong (wrong password, out-of-stock item, incomplete booking form), the message tells me clearly what to fix.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q23 · Linear scale 1–5 · ✳ Required**
The system prevents my mistakes — it validates my inputs and warns me before I confirm an order, payment, or booking.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q24 · Linear scale 1–5 · ✳ Required**
The design is clean and pleasant: text is easy to read, colors are comfortable, and pages look consistent with one another.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q25 · Linear scale 1–5 · ✳ Required**
The system is usable for everyone — readable fonts, good contrast, and full keyboard operation for people who cannot use a mouse.
`1 = Strongly disagree` … `5 = Strongly agree` · ○ N/A — I don't know enough to judge

---

## ── Section 7: Can you count on it? (Reliability) ──

**Q26 · Linear scale 1–5 · ✳ Required**
The system is available when I need it — I have not been blocked by downtime at the moment I wanted to buy or book.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q27 · Linear scale 1–5 · ✳ Required**
The system runs steadily — no crashes, freezes, or unexpected logouts while I am using it.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q28 · Linear scale 1–5 · ✳ Required**
If a page fails or my connection drops in the middle of an order or booking, I can return and continue without losing my work.
`1 = Strongly disagree` … `5 = Strongly agree` · ○ N/A — this never happened to me

**Q29 · Linear scale 1–5 · ✳ Required**
My cart, orders, bookings, and payment records are never lost, duplicated, or changed without my doing anything.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q30 · Multiple choice · ✳ Required**
Have you ever experienced any of these?

- ○ None of these
- ○ The system was slow or unavailable when I tried to use it
- ○ An item showed as available but turned out to be out of stock
- ○ My order, receipt, or booking did not appear / did not arrive
- ○ Something else: __________

---

## ── Section 8: Keeping you safe (Security) ──

**Q31 · Linear scale 1–5 · ✳ Required**
I feel safe entering my personal details (name, address, contact number, pet information) in the system.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q32 · Linear scale 1–5 · ✳ Required**
My account is protected — only I can log in with my email and password, and I am asked to confirm my password again for sensitive actions.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q33 · Linear scale 1–5 · ✳ Required**
Access rights are respected: customers, staff, and admins each see only what their role allows — nobody can access another role's functions.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q34 · Linear scale 1–5 · ✳ Required**
Transactions are recorded correctly — I receive confirmations, receipts, and status updates that prove what happened (no unauthorized changes to my orders or payments).
`1 = Strongly disagree` … `5 = Strongly agree`

---

## ── Section 9: Using it anywhere (Portability) ──

**Q35 · Linear scale 1–5 · ✳ Required**
I can move from one device to another (phone to computer, for example) and continue using the system with no problem.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q36 · Multiple choice · ✳ Required**
Getting started on a new device was:

- ○ Instant — I just open the browser and go
- ○ Easy — I logged in and everything was back
- ○ Awkward — some things did not carry over
- ○ I only ever used one device

**Q37 · Multiple choice · ✳ Required**
Did you know the system can be added to your phone's home screen like an app (Progressive Web App), without downloading from an app store?

- ○ Yes — I installed it / saw the prompt
- ○ No — I didn't know that
- ○ I saw it but it didn't work on my phone

---

## ── Section 10: Your overall experience (Quality in use) ──

**Q38 · Linear scale 1–5 · ✳ Required**
The system helped me complete what I came to do (find the right product or service and finish the transaction) without giving up.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q39 · Linear scale 1–5 · ✳ Required**
Using the system saves me time and effort compared with going to the store or calling to ask.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q40 · Linear scale 1–5 · ✳ Required**
Overall, I am satisfied with the Whiskers Petshop system.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q41 · Paragraph · Optional**
What is the **one thing** we should fix first to improve the system?

___________________________________________________________________________
___________________________________________________________________________

**Q42 · Paragraph · Optional**
Any other comments, compliments, or complaints?

___________________________________________________________________________
___________________________________________________________________________

> **End of Form N.** *Confirmation message: "Thank you! Your anonymous responses will be used to evaluate and improve the Whiskers Petshop system."*

---

# 📋 FORM T — System Evaluation Questionnaire (IT Experts)

**ISO/IEC 25010:2011 · All eight product-quality characteristics: functional suitability, performance efficiency, compatibility, usability, reliability, security, maintainability, portability**

> *About this survey · 46 questions · ~15 minutes*
> This form is for respondents with an IT background (developers, system administrators, IT faculty, QA testers, technical evaluators). Answer for **how the system actually performs**, not what the documentation claims. Most items use the same **1 = Strongly disagree … 5 = Strongly agree** scale; a few are multiple-choice. Gaps found now are far cheaper than gaps found by a panel.
> Where offered, **N/A** may be selected if you did not evaluate that area.

---

## ── Section 1: Respondent profile (§4.3.1) ──

**Q1 · Multiple choice · ✳ Required**
Which best describes your role?

- ○ Software developer / Engineer
- ○ Systems / cloud administrator
- ○ QA / Test engineer
- ○ IT manager / Architect
- ○ IT academic / Instructor / Researcher
- ○ IT student
- ○ Other: __________

**Q2 · Multiple choice · ✳ Required**
How many years have you worked or studied in IT?

- ○ Less than 2 years
- ○ 2–5 years
- ○ 5–10 years
- ○ More than 10 years

**Q3 · Checkboxes · ✳ Required**
Which of these can you judge competently? *(Tick all that apply)*

- ☐ Front-end interfaces (React, responsive design, PWA)
- ☐ Back-end services (Node.js / Express, REST APIs)
- ☐ Databases (PostgreSQL / Supabase, authentication)
- ☐ Security (authentication, role-based access control, encryption)
- ☐ Deployment / cloud (Microsoft Azure, Docker)
- ☐ Software quality and testing methodologies
- ☐ Data analytics and reporting

**Q4 · Multiple choice · ✳ Required**
How did you evaluate this system?

- ○ Used the live system and inspected documentation / source code
- ○ Used the live system only
- ○ Read the documentation / paper only
- ○ Demo walkthrough by the developers

---

## ── Section 2: Functional suitability ──

**Q5 · Linear scale 1–5 · ✳ Required**
The implemented functions cover what a pet shop platform needs (catalog with descriptions/prices/stock, cart, checkout, orders, reviews, support, booking, analytics, admin/staff management) — the functional set is complete for its purpose.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: functional completeness*

**Q6 · Linear scale 1–5 · ✳ Required**
Business rules execute accurately: prices, stock availability, order totals, booking schedules, and report figures are computed correctly every time.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: functional correctness*

**Q7 · Linear scale 1–5 · ✳ Required**
Each function is appropriate to its task — every screen and module does something a customer, staff member, or manager actually needs, with no significant missing or misplaced functionality.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: functional appropriateness*

**Q8 · Linear scale 1–5 · ✳ Required**
The Pet Food Recommendation System produces suitable output from the pet health data entered (health condition, allergies, dietary requirements), following the paper's prescription-based logic.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: functional correctness*

**Q9 · Linear scale 1–5 · ✳ Required**
The data analytics feature generates correct and meaningful reports on sales performance, product trends, inventory movement, and customer buying habits — figures reconcile with the underlying transaction records.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: functional correctness*

**Q10 · Multiple choice · ✳ Required**
Which area, if any, has a functional gap you consider significant?

- ○ None — no significant gap found
- ○ Pet food recommendations
- ○ Cart / checkout / payment recording
- ○ Service booking
- ○ Order management (customer/staff/admin)
- ○ Analytics and reports
- ○ Content management (products, pricing, promotions)
- ○ Reviews / support / FAQ
- ○ Other: __________

---

## ── Section 3: Performance efficiency ──

**Q11 · Linear scale 1–5 · ✳ Required**
API responses and page loads complete within an acceptable time under normal load (catalog browsing, cart operations, checkout, dashboard queries).
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: time behaviour*

**Q12 · Linear scale 1–5 · ✳ Required**
The system manages its resources well for its scale — no obvious waste in memory, database queries, or bandwidth (e.g. images optimised, no unnecessary payload per request).
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: resource utilisation*

**Q13 · Linear scale 1–5 · ✳ Required**
The system handles its expected capacity — the customer base (~1,200 monthly customers) and concurrent users do not degrade response times or overflow the database.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: capacity*

**Q14 · Linear scale 1–5 · ✳ Required**
Content and inventory updates propagate to users quickly — product/price/promotion changes made in the content management system reach customers in near-real-time.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: time behaviour*

**Q15 · Multiple choice · ✳ Required**
Have you observed any performance problem?

- ○ None observed
- ○ Slow initial load on poor connections
- ○ Noticeable delay on data-heavy pages (analytics, large tables)
- ○ Rate limiting or timeouts during testing
- ○ Other: __________

---

## ── Section 4: Compatibility ──

**Q16 · Linear scale 1–5 · ✳ Required**
The system operates correctly alongside the browsers and devices tested (Chrome, Firefox, Edge; Android/iOS; phone/tablet/desktop viewports).
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: co-existence*

**Q17 · Linear scale 1–5 · ✳ Required**
Interfaces exchange data correctly with other components — the web/mobile front ends consume the same API without conflict, and authentication, payments, and reports integrate as documented.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: interoperability*

**Q18 · Linear scale 1–5 · ✳ Required**
The system co-exists cleanly with its platform dependencies (React/Vite front end, Node/Express back end, Supabase database/auth, cloud hosting) without version or configuration clashes.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: co-existence*

**Q19 · Multiple choice · ✳ Required**
Any compatibility issue found?

- ○ None
- ○ Browser-specific rendering issue
- ○ Mobile / desktop viewport issue
- ○ Third-party service configuration issue
- ○ Other: __________

---

## ── Section 5: Usability (technical view) ──

**Q20 · Linear scale 1–5 · ✳ Required**
The interface is consistent and learnable — layouts, terminology, status indicators, and interaction patterns are uniform across customer, staff, and admin views.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristics: learnability, operability*

**Q21 · Linear scale 1–5 · ✳ Required**
The system provides clear feedback for every state (loading, empty, success, error) and prevents user error before it happens (input validation, stock/price re-checks, confirmation steps for sensitive actions).
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: protection against user error*

**Q22 · Linear scale 1–5 · ✳ Required**
Accessibility measures are implemented: keyboard navigation, focus handling on modals, readable contrast, and responsive layouts without horizontal overflow on common screen sizes.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: accessibility*

**Q23 · Linear scale 1–5 · ✳ Required**
Visual design supports the task — typography, spacing, and colour use are appropriate for a retail storefront and its analytics dashboards.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: user interface aesthetics*

---

## ── Section 6: Reliability ──

**Q24 · Linear scale 1–5 · ✳ Required**
The system behaves correctly over repeated use — unit, integration, and end-to-end tests pass, and no recurring defects appear in routine operation.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: maturity*

**Q25 · Linear scale 1–5 · ✳ Required**
When an unexpected input or failure occurs (bad promo code, out-of-stock race, missing configuration, email service unavailable), the system continues or fails gracefully instead of corrupting data or exposing a stack trace.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: fault tolerance*

**Q26 · Linear scale 1–5 · ✳ Required**
The system can be restored after a failure (redeploy, re-seed, recover database data) within an acceptable time.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: recoverability*

**Q27 · Linear scale 1–5 · ✳ Required**
The system's availability meets the expectation of a store serving customers daily (9 AM–9 PM, no unexpected outages during operating hours).
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: availability*

---

## ── Section 7: Security ──

**Q28 · Linear scale 1–5 · ✳ Required**
Confidentiality controls are adequate: credentials and sensitive fields are protected in storage and transit, and data access is scoped by role.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: confidentiality*

**Q29 · Linear scale 1–5 · ✳ Required**
Data integrity is protected — order, payment, price, and stock records are written consistently, and inputs are validated on both client and server.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: integrity*

**Q30 · Linear scale 1–5 · ✳ Required**
Authentication and identity are sound: JWT-based login via Supabase, a three-role model (Customer/Staff/Admin), server-side role checks, and password re-verification for state-changing actions.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: authenticity*

**Q31 · Linear scale 1–5 · ✳ Required**
Actions are accountable — admin/staff changes and sign-ins are traceable in the system's records, and transactions produce confirmations and receipts.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: accountability*

**Q32 · Linear scale 1–5 · ✳ Required**
Non-repudiation is supported: order confirmations, official receipts, and payment records give verifiable evidence that both parties performed their part.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: non-repudiation*

**Q33 · Linear scale 1–5 · ✳ Required**
Hardening is applied as expected: security headers, rate limiting, parameterised database access / row-level security, and dependency review before release.
`1 = Strongly disagree` … `5 = Strongly agree`

**Q34 · Multiple choice · ✳ Required**
The most significant security gap you observed (if any):

- ○ None identified in review
- ○ No automated security testing (SAST/DAST) in the pipeline
- ○ Secrets / key-management approach needs hardening
- ○ Payment confirmation relies on trust rather than a gateway
- ○ Other: __________

---

## ── Section 8: Maintainability ──

**Q35 · Linear scale 1–5 · ✳ Required**
The codebase is modular — front end, back end, and database layers are clearly separated, and feature modules are organised so it is clear where each change belongs.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: modularity*

**Q36 · Linear scale 1–5 · ✳ Required**
The system is easy to analyse — readable naming, consistent style, documentation, structured logging, and diagrams make it straightforward to locate the cause of a defect.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: analysability*

**Q37 · Linear scale 1–5 · ✳ Required**
Changes are safe to make — configuration and shared rules mean a modification (price, shipping rule, content, navigation) propagates predictably without breaking unrelated features.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: modifiability*

**Q38 · Linear scale 1–5 · ✳ Required**
The system is well tested — automated backend, frontend, and end-to-end suites give fast feedback, and defects are caught before release.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: testability*

**Q39 · Linear scale 1–5 · ✳ Required**
Reusable components exist where they should (shared UI components on the front end, shared validation/utility modules on the back end) rather than duplicated logic.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: reusability*

---

## ── Section 9: Portability ──

**Q40 · Linear scale 1–5 · ✳ Required**
Installation and setup are straightforward and documented — environment templates, one-command startup, and container configuration bring the system up on a clean machine.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: installability*

**Q41 · Linear scale 1–5 · ✳ Required**
The system adapts to different environments without code changes — configuration via environment variables and responsive/PWA front ends support local development, containerised, and cloud (Microsoft Azure) deployments.
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: adaptability*

**Q42 · Linear scale 1–5 · ✳ Required**
Components can be replaced when needed — standard database schema, documented APIs, and modular structure limit vendor lock-in (e.g. swapping the database or authentication provider is feasible).
`1 = Strongly disagree` … `5 = Strongly agree` · *Sub-characteristic: replaceability*

**Q43 · Multiple choice · ✳ Required**
Deployment effort for a new environment (fresh VM / another host):

- ○ Under an hour following the README
- ○ A few hours, with some troubleshooting
- ○ A day or more
- ○ I did not attempt it / N/A

---

## ── Section 10: Your view ──

**Q44 · Paragraph · ✳ Required**
If you could fund **one** quality improvement next year (performance, security, maintainability, etc.), what would it be and why?

___________________________________________________________________________
___________________________________________________________________________

**Q45 · Paragraph · Optional**
Any other technical observations — defects found, design concerns, or things done well?

___________________________________________________________________________
___________________________________________________________________________

**Q46 · Paragraph · Optional**
Compare the system with its stated goals (cross-platform ecosystem, pet food recommendations, data analytics): how well does the implementation deliver them?

___________________________________________________________________________
___________________________________________________________________________

> **End of Form T.** *Confirmation message: "Thank you — your responses feed directly into the evaluation and improvement of the system."*

---

# Appendix 1 — Question-to-ISO 25010 mapping

Use this table in Chapter IV §4.3.2 (Questionnaire Results): each survey dimension is traceable to an ISO 25010 characteristic and sub-characteristic.

### Form N — Non-IT respondents

| ISO 25010 characteristic | Sub-characteristic(s) measured | Form N questions |
|---|---|---|
| **Functional suitability** | Functional completeness, functional correctness, functional appropriateness | Q7–Q12 |
| **Performance efficiency** | Time behaviour, capacity | Q13–Q16 |
| **Compatibility** | Co-existence, interoperability | Q17–Q19 |
| **Usability** | Learnability, operability, protection against user error, UI aesthetics, accessibility | Q20–Q25 |
| **Reliability** | Availability, maturity, recoverability, fault tolerance | Q26–Q30 |
| **Security** | Confidentiality, integrity, authenticity, accountability | Q31–Q34 |
| **Portability** | Adaptability, installability | Q35–Q37 |
| **Quality in use** (ISO 25010 quality-in-use model) | Effectiveness, efficiency, satisfaction | Q38–Q40 |
| Open feedback | — | Q41–Q42 |
| Respondent profile (§4.3.1) | — | Q1–Q6 |

### Form T — IT experts

| ISO 25010 characteristic | Sub-characteristic(s) measured | Form T questions |
|---|---|---|
| **Functional suitability** | Functional completeness, functional correctness, functional appropriateness | Q5–Q10 |
| **Performance efficiency** | Time behaviour, resource utilisation, capacity | Q11–Q15 |
| **Compatibility** | Co-existence, interoperability | Q16–Q19 |
| **Usability** | Learnability, operability, protection against user error, accessibility, UI aesthetics | Q20–Q23 |
| **Reliability** | Maturity, fault tolerance, recoverability, availability | Q24–Q27 |
| **Security** | Confidentiality, integrity, authenticity, accountability, non-repudiation | Q28–Q34 |
| **Maintainability** | Modularity, analysability, modifiability, testability, reusability | Q35–Q39 |
| **Portability** | Installability, adaptability, replaceability | Q40–Q43 |
| Open feedback | — | Q44–Q46 |
| Respondent profile (§4.3.1) | — | Q1–Q4 |

> Maintainability is rated only by Form T because non-technical users cannot honestly judge code structure; every other characteristic appears in both forms so the two respondent groups can be compared dimension by dimension.

---

# Appendix 2 — How to score the results (§4.3.2 and §4.4)

The paper specifies **frequency, percentage, mean, and weighted mean** (§3.2.5), so the Likert answers are scored by weighted mean.

**Likert interpretation table for §4.4:**

| Weighted mean | Interpretation |
|---|---|
| 4.20 – 5.00 | Strongly agree |
| 3.40 – 4.19 | Agree |
| 2.60 – 3.39 | Neutral |
| 1.80 – 2.59 | Disagree |
| 1.00 – 1.79 | Strongly disagree |

**Procedure:**

1. **Per item:** weighted mean of the 1–5 responses (skip N/A).
2. **Per characteristic:** average the item means within each ISO 25010 dimension; report the mean **and** standard deviation.
3. **Per form:** overall mean = average of the characteristic means (state in §4.3 that dimensions were weighted equally).
4. **Profile tables (§4.3.1):** frequency and percentage for each profile question (Q2–Q6 Form N; Q1–Q4 Form T).

**Reporting checklist for Chapter IV:**

- One results table per form: rows = the eight ISO 25010 characteristics (+ quality in use for Form N), columns = number of items, weighted mean, interpretation.
- State sample sizes: Form N should target the paper's **300-respondent** plan (Cochran, n ≈ 292 → 300) drawn from the ~1,200 monthly customers; Form T is a purposive expert sample — report it as such rather than applying Cochran.
- Note that Form N's Q6 filters out IT-professionals who should answer Form T instead; report how many were excluded.
- Attach 2–3 representative open-ended quotes from Q41/Q42 (Form N) and Q44–Q46 (Form T) in §4.3.2.

**Reading the two forms together:**

- **Form T ≥ Form N** by a wide margin → the system is technically sound but the *experience* fails users — prioritise usability and performance work in Chapter V.
- **Form N ≥ Form T** → users are satisfied but reviewers see structural debt (maintainability, security hardening) — prioritise refactoring and hardening before scaling.
- Any characteristic mean **below 3.40 (below "Agree")** should be discussed explicitly in Chapter V alongside the objective test evidence (§4.2 System Test Plan).

**ISO 25010 note for the paper:** cite the standard as *ISO/IEC 25010:2011, Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*, and mention that the 2023 revision adds *functional safety* as a ninth characteristic if your panel asks.
