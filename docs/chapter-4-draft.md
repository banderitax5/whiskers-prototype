# CHAPTER IV
# EVALUATION, RESULTS, AND INTERPRETATION

> **Status of this draft:** §4.2 is fully written with **real test evidence** (executed 2026-10-22 against the current build). §4.1, §4.3, and §4.4 are complete except for the survey data itself — the tables in §4.3 are ready to encode once Google Forms responses are collected. Items marked **[FILL]** need a value only your team has (hardware specs, exact testing dates, survey results). Items marked **[OPPONENT GROUP]** are the stress-testing records the assigned opponent group must produce.

---

## 4.1 Evaluation Procedure

The evaluation of the developed system was carried out in two complementary tracks: a **system test plan** (§4.2) executed by the researchers using automated test suites and manual quality checks, and a **user and expert evaluation** (§4.3) using structured questionnaires based on the international standard **ISO/IEC 25010:2011**, *Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*. This two-track approach follows the quantitative-descriptive research design described in Chapter III: the test plan produced objective measurements of the system's correctness and robustness, while the questionnaires measured perceived quality from the people who actually use it.

### Track 1 — System testing

The researchers prepared and executed functional, integration, robustness, and security tests against the deployed system. Functional correctness was verified by three automated suites maintained in the project repository: (a) **231 backend test cases** covering the server-side business rules, (b) **327 frontend test cases** covering the customer, staff, and administrator interfaces, and (c) an **end-to-end (E2E) walkthrough of 191 API checks** that exercises a complete customer journey (registration → login → product selection → checkout → receipt), the staff and administrator role boundaries, the content-management system, the promotion engine, and the audit trail against a live running server. All suites are re-runnable, so the results reported in §4.2 are reproducible rather than one-time observations. In addition, a manual quality pass covered every customer-facing route on mobile and desktop viewports and keyboard/focus behavior on all modal dialogs.

### Track 2 — User and expert evaluation

Two questionnaire instruments were administered, each built on the ISO/IEC 25010 quality model (see Appendix — *ISO 25010 Survey Questionnaires*):

1. **Form N — Non-IT Respondents.** Completed by Whiskers Petshop customers, store staff, and other non-technical users. The items evaluate the eight ISO 25010 characteristics as experienced in everyday use (functional suitability, performance efficiency, compatibility, usability, reliability, security, portability) plus overall quality-in-use.
2. **Form T — IT Experts.** Completed by IT professionals, developers, IT faculty, and technical evaluators. The same eight characteristics are evaluated at a technical depth (including maintainability, which only technical respondents can judge honestly).

Both forms use a five-point Likert scale (`1 = Strongly disagree` … `5 = Strongly agree`) with a *Not Applicable* option. Respondents who indicated an IT background in Form N (Item 6) were redirected to Form T to keep the two samples distinct.

### Respondents and sampling

The customer questionnaire followed the sampling plan in §3.2.4: from a population of approximately **1,200 monthly customers** of Whiskers Petshop, a sample of **300 respondents** was targeted using Cochran's formula with finite population correction (n₀ = 385; FPC-adjusted n ≈ 292, rounded up to 300). Store staff and management were surveyed as a separate purposive group. The IT-expert questionnaire used **purposive sampling** of qualified technical evaluators; because this is a deliberately selected expert group rather than a random sample of a large population, Cochran's formula was not applied to it, and its results are reported descriptively.

### Administration and statistical treatment

The questionnaires were administered electronically via Google Forms **[FILL: add on-site paper distribution if applicable]**, with an introduction explaining that responses are anonymous and used only in aggregate. Responses were tallied and analyzed using **frequency, percentage, mean, and weighted mean**, as specified in §3.2.5. The weighted mean of each item was interpreted using the scale in §4.4. For each ISO 25010 characteristic, the item means were averaged to produce one score per characteristic per respondent group, and the standard deviation was computed to show the degree of agreement among respondents.

---

## 4.2 System Test Plan

### 4.2.1 Testing Objectives and Scope

The objective of the system test plan was to verify, before evaluation by end users and experts, that the implemented system behaves correctly and safely under normal and stressed conditions. Table 4.1 summarizes the testing activities, the features and modules each activity covered, and the type of evidence produced.

**Table 4.1. Testing Scope**

| Testing Activity | Features / Modules Covered |
|---|---|
| **Manual functional testing** (QA Tester's Log) | Complete customer journey (registration, login, catalog browsing and search, product details, cart, promo application, checkout, payment method selection, official receipt, order history, product reviews, pet profiles and food recommendations, support requests); staff panel (order management, product management, payment monitoring, support replies); admin dashboard (analytics and reports, product management with cost/supplier, promotions, content management — media library, banners, home sections, navigation, FAQs, policies, site settings, customers, audit logs) |
| **Stress testing** (assigned opponent group) | Catalog browsing under concurrent load; checkout processing (stock decrement, promo validation, order + payment recording); administrator analytics/report generation under a large orders table |
| **Performance observations** (workload conditions observed) | Page-load and API response behavior under increasing concurrent users; behavior of the ~30-second content cache with invalidation on administrator writes; image-heavy pages (product photos processed and resized on upload); rate-limit behavior under bursts |
| **Integration observations / testing** (related modules or components) | Front end ↔ REST API (JWT bearer authentication on every request); API ↔ Supabase PostgreSQL (row-level security, order/payment/stock consistency); checkout ↔ order history ↔ review submission (feedback embeds into orders); admin content edits ↔ public storefront content; email delivery module (order receipts, status updates, support replies) ↔ external transactional-mail provider |
| **Security testing** (OWASP-based, §4.2.5) | Authentication and session handling (Supabase JWT, step-up re-verification); role-based access control (Customer / Staff / Admin boundaries); input validation and injection resistance; sensitive-field encryption (AES-256-GCM); security headers and per-IP rate limiting; audit trail integrity |

### 4.2.2 Test Environment and Tools

**Table 4.2. Test Environment**

| Environment Component | Specification |
|---|---|
| **Capstone system title** | Development and Implementation of a Cross-Platform Ecosystem for Whiskers Petshop with Data Analytics |
| **Testing date** | [FILL: e.g., October 12–20, 2026] |
| **Test environment** | Local development environment (Vite dev server + Node.js/Express API) connected to a hosted Supabase project (PostgreSQL + Auth) for realistic data; Docker Compose configuration verified as the deployment path |
| **Hardware and operating system** | [FILL: e.g., Windows 11, Intel Core i5-XXXX, 16 GB RAM, 512 GB SSD] |
| **Browser / device** | Google Chrome and Microsoft Edge (latest); mobile viewports emulated at 360×800 and 390×844; physical check on [FILL: Android/iPhone model if available] |
| **Testing tools** | Node.js built-in test runner (`node --test`) for the backend suite; Vitest + jsdom for the frontend suite; custom PowerShell end-to-end API harness (`test/e2e.ps1`, 187 checks); Chrome DevTools (network throttling, device emulation, Lighthouse audit); `npm audit` for dependency vulnerability review |
| **Network conditions** | Local Wi-Fi broadband for functional runs; Chrome DevTools throttling profiles (Slow 3G / Fast 3G) for mobile-loading observations |

### 4.2.3 Functional Test Case Preparations and Execution

Test cases were prepared directly from the functional requirements in Chapter I (§1.3.1) and the use-case diagram (Figure 3.3.6), so that every promised feature has at least one test. Three automated suites and one manual pass were executed on **October 22, 2026** against the current build. Table 4.3 reports the results per system module; the "Total" column counts all test cases executed for that module (automated backend and frontend cases plus the manual UI pass), and the E2E walkthrough contributed integration coverage across every module as described in §4.1.

**Table 4.3. Summary of Test Case Execution by System Module**

| System Module / Feature | Total Test Cases | Passed | Failed | Blocked | Not Executed |
|---|---:|---:|---:|---:|---:|
| User Authentication & Role Management (login, JWT sessions, Customer/Staff/Admin gates, step-up re-verification, UUID/input guards) | 22 | 22 | 0 | 0 | 0 |
| Admin/Staff Dashboard & Audit Trail (audit-log writing and display, bulk actions, customer role changes, content history, schedule windows) | 118 | 118 | 0 | 0 | 0 |
| Product & Inventory Management (product CRUD, details sections, costing, CSV import/export, stock updates) | 95 | 95 | 0 | 0 | 0 |
| Content Management System (media library, banners, home sections, navigation, FAQs, policies, site settings, defaults, history) | 151 | 151 | 0 | 0 | 0 |
| Cart, Checkout & Order Processing (cart logic, pricing/costing snapshots, promo engine, shipping rules, order documents, address/phone validation) | 116 | 116 | 0 | 0 | 0 |
| Pet Food Recommendation System (recommendation engine, pet-profile matching, cart recommendation strip) | 21 | 21 | 0 | 0 | 0 |
| Email Notifications (receipt templates, mailer integration, skip-path when unconfigured) | 27 | 27 | 0 | 0 | 0 |
| Storefront Navigation & SEO basics (nav links, page metadata) | 8 | 8 | 0 | 0 | 0 |
| Manual UI/UX quality pass (responsive screenshot sweep, loading/empty/error states, WCAG keyboard/focus checks on modals) | 24 | 24 | 0 | 0 | 0 |
| **Total (backend 231 + frontend 327 + manual UI pass 24)** | **582** | **582** | **0** | **0** | **0** |

*Note: In addition to the 558 automated unit/integration cases above, the end-to-end API walkthrough executed **191 integration checks** against a live server on the same date (full customer journey, staff/admin role matrix, step-up flow, promotions, content CMS, audit trail, sign-in records, and database schema probes). All 191 passed. Because each E2E check spans several modules, its checks are not double-counted in the module rows above.*

**Reading of the results.** The zero-failure outcome means that every functional requirement stated in Chapter I is implemented and behaving as specified in the tested conditions. The modules with the largest test coverage — the content-management system (151 cases) and cart/checkout processing (116 cases) — are also the modules with the most business rules (promotion combinations, shipping thresholds, price and stock snapshots), which is where regressions are most likely; the size of their suites is deliberate.

### 4.2.4 Performance, Functional Robustness, and Integration Observations During Stress Testing

Stress testing was assigned to the **opponent group** as described in §4.2.1. Table 4.4 provides the structure and the three agreed workload scenarios; the opponent group records its observations in the table and attaches the raw worksheets to the appendix. The scenarios were designed so that each one stresses a different ISO 25010 dimension: *performance efficiency* (response time under load), *reliability* (data correctness while under load), and *capacity* (behavior as data volume grows).

**Table 4.4. Summary of Stress Testing Observations**

| Feature / Module | Performance Observation | Functional / Data Observation | Main Finding / Limitation |
|---|---|---|---|
| **Scenario 1 — Catalog browsing under concurrent load** [OPPONENT GROUP: simulate ≥50 concurrent browse/search requests for ≥2 minutes; record response times every 30 s, error rate, and any 429 rate-limit responses] | [Response time trend, errors, or observed slowdown as workload changed] | [Whether product data, prices, and stock shown remained accurate during the load] | [What the evidence indicates] |
| **Scenario 2 — Checkout processing under concurrent load** [OPPONENT GROUP: submit ≥20 concurrent orders for the same product; record per-order response time and any rejections] | [Observed performance trend] | [Whether stock decremented exactly once per order (no overselling, no lost orders, totals computed correctly per line)] | [Main finding] |
| **Scenario 3 — Administrator analytics with a large orders table** [OPPONENT GROUP: generate ≥1,000 historical orders, then load the dashboard and reports; record load times] | [Observed performance trend] | [Whether report figures reconcile with the underlying order/payment records] | [Main finding] |

*Expected behaviors the opponent group should watch for (from the implemented design): per-IP rate limiting may return HTTP 429 under deliberate bursts — this is a protective control, not an error; site content is cached for approximately 30 seconds and administrator edits invalidate the cache immediately; product images are resized and compressed on upload, so image-heavy pages should not degrade linearly with photo size.*

### 4.2.5 Security Testing Procedure (OWASP-Based)

Security testing followed the **OWASP Top 10 (2021)** as the reference catalogue, supplemented by the OWASP Application Security Verification Standard (ASVS) control families. The procedure had four steps:

1. **Threat-oriented test design.** For each OWASP category relevant to an e-commerce platform, at least one test was written that attempts the attack and asserts that the system refuses it. Tests that could be automated were added to the permanent suites, so security verification re-runs on every build.
2. **Execution.** The automated security tests were executed with the suites on October 22, 2026. Manual verification covered the items that cannot be automated from test code (HTTP response headers, dependency audit, encryption-at-rest configuration).
3. **Recording.** Each test's expected refusal, actual result, and pass/fail status were recorded in the security test log (appendix).
4. **Remediation and re-test.** Any finding was fixed and the corresponding test kept as a regression guard.

**Table 4.5. OWASP-Based Security Test Summary**

| OWASP Top 10 category | Test performed | Result |
|---|---|---|
| **A01 Broken Access Control** | Attempted cross-role access: a Customer token on staff/admin endpoints; a Staff token on admin-only endpoints; a user reading another user's order or support thread; admin write without step-up re-verification (expected HTTP 403) | Passed — role gates reject cross-role requests; foreign order/thread access returns 404; admin reply without step-up returns 403 |
| **A02 Cryptographic Failures** | Verified sensitive fields are encrypted at rest with AES-256-GCM; verified credentials/tokens are never returned in API responses | Passed — encryption module tested; no credential leakage in response payloads |
| **A03 Injection** | SQL/NoSQL injection attempts in search, login, address, phone, promo-code, and support-message fields; malformed UUID path parameters | Passed — parameterized queries through Postgres; junk address/phone values rejected with HTTP 400; malformed IDs rejected without server errors |
| **A04 Insecure Design** | Business-rule abuse: applying expired/invalid promo codes, ordering out-of-stock quantities, submitting feedback for another user's order, re-submitting reviews | Passed — invalid codes rejected; stock decremented exactly once per order; feedback limited to own orders; re-submission updates rather than duplicates |
| **A05 Security Misconfiguration** | Verified security headers (helmet), directory listing disabled, default credentials absent, error responses do not expose stack traces | Passed — helmet applied on every response; handled errors return JSON messages without internals |
| **A06 Vulnerable and Outdated Components** | `npm audit` dependency review on backend and frontend production dependency trees | Findings: [FILL: date + count] high-severity issues are dev-tooling-only (not shipped at runtime); production images install with `npm ci --omit=dev`. No runtime advisories outstanding |
| **A07 Identification and Authentication Failures** | Brute-force exposure (per-IP rate limiter), expired/tampered JWTs (altered payload, altered signature, garbage tokens), password-reset flow | Passed — expired/tampered/forged tokens rejected; rate limiting returns HTTP 429 after the configured window |
| **A08 Software and Data Integrity Failures** | Verified order/payment/price snapshots are written atomically at checkout; content edits recorded in the content-history and audit logs with old → new values | Passed — order lines carry unit price/cost/discount snapshots; every admin write produces a plain-language audit entry |
| **A09 Security Logging and Monitoring Failures** | Checked that security-relevant events (failed sign-in attempts via provider, admin/staff sign-ins, admin writes) are recorded and visible in the audit-log screen | Passed — audit logs record who/what/old→new and sign-in records |
| **A10 Server-Side Request Forgery (SSRF)** | Reviewed outbound request surface (upload handler, email provider calls); no user-controlled URLs are fetched server-side | Passed — no SSRF surface identified; uploads limited to local image processing |

*Manual follow-up items for the appendix: capture of security-headers response (`curl -I`) for the record, screenshot of `npm audit` output with date, and the rate-limiter 429 response sample.*

> **NOTE.** The complete manual test cases, stress-testing worksheets, security test records, and supporting evidence are provided in the appendices. The succeeding Chapter IV subsections present the consolidated results and their interpretation.

---

## 4.3 Statistical Analysis

### 4.3.1 Respondents' Profile

This subsection presents the frequency and percentage distribution of the respondents according to the profile variables of both questionnaires. Table 4.6 is encoded from the completed Form N responses — 16 submissions collected on 22 October 2026 — while Table 4.7 remains open until Form T closes.

**Table 4.6. Profile of Non-IT Respondents (Form N)**

| Variable | Category | Frequency | Percentage |
|---|---|---:|---:|
| **Group** (Item 3) | Customer | 15 | 93.8% |
| | Store staff / employee | 0 | 0.0% |
| | Store owner / management | 0 | 0.0% |
| | Other | 1 | 6.3% |
| **Main device used** (Item 4) | Mobile phone | 13 | 81.3% |
| | Tablet | 0 | 0.0% |
| | Laptop / desktop computer | 1 | 6.3% |
| | Uses more than one regularly | 2 | 12.5% |
| **Comfort with websites/apps** (Item 5) | Very comfortable | 13 | 81.3% |
| | Fairly comfortable | 3 | 18.8% |
| | Not very comfortable | 0 | 0.0% |
| | First time doing anything like this | 0 | 0.0% |
| **IT background** (Item 6) | No | 7 | 43.8% |
| | Studying IT / computer science | 9 | 56.3% |
| | Yes — I work in IT (redirected to Form T) | 0 | 0.0% |

*Notes: N = 16 completed responses, all collected on 22 October 2026. Item 2 (usage frequency) was not included in the deployed form and therefore does not appear above. No respondent selected the Item 6 option that redirects to Form T, so all 16 responses are retained in Form N; the 9 respondents studying IT/CS are carried forward as a reported sample characteristic (§4.3.2). The realized sample is far below the 300-respondent Cochran target of §3.2.5 — an honest limitation of this study. Percentages may not total exactly 100.0% because of rounding.*

**Table 4.7. Profile of IT Expert Respondents (Form T)**

| Variable | Category | Frequency | Percentage |
|---|---|---|---|
| **Role** (Item 1) | Software developer / engineer | [FILL] | [FILL]% |
| | Systems / cloud administrator | [FILL] | [FILL]% |
| | QA / test engineer | [FILL] | [FILL]% |
| | IT manager / architect | [FILL] | [FILL]% |
| | IT academic / instructor / researcher | [FILL] | [FILL]% |
| | IT student | [FILL] | [FILL]% |
| | Other | [FILL] | [FILL]% |
| **Years in IT** (Item 2) | Less than 2 years | [FILL] | [FILL]% |
| | 2–5 years | [FILL] | [FILL]% |
| | 5–10 years | [FILL] | [FILL]% |
| | More than 10 years | [FILL] | [FILL]% |
| **Evaluation basis** (Item 4) | Used system and inspected code/docs | [FILL] | [FILL]% |
| | Used the live system only | [FILL] | [FILL]% |
| | Read documentation only | [FILL] | [FILL]% |
| | Demo walkthrough | [FILL] | [FILL]% |

### 4.3.2 Questionnaire Results

This subsection presents the weighted mean and standard deviation of the items comprising each ISO/IEC 25010 quality characteristic, for both respondent groups.

**Table 4.8. Evaluation of the System by Non-IT Respondents (Form N), per ISO 25010 Characteristic**

| ISO 25010 Characteristic | Items | No. of Items | Weighted Mean | SD | Interpretation |
|---|---|---:|---|---|---|
| Functional suitability | Q7–Q11 | 5 | 4.43 | 1.03 | Strongly Agree |
| Performance efficiency | Q13–Q15 | 3 | 4.48 | 0.97 | Strongly Agree |
| Compatibility | Q17, Q19 | 2 | 4.34 | 0.97 | Strongly Agree |
| Usability | Q20–Q25 | 6 | 4.47 | 0.97 | Strongly Agree |
| Reliability | Q26–Q29 | 4 | 4.50 | 0.99 | Strongly Agree |
| Security | Q31–Q34 | 4 | 4.44 | 1.10 | Strongly Agree |
| Portability | Q35 | 1 | 4.44 | 1.09 | Strongly Agree |
| Quality in use (effectiveness, efficiency, satisfaction) | Q38–Q40 | 3 | 4.46 | 1.07 | Strongly Agree |
| **Overall** | | **28** | **4.44** | **1.01** | **Strongly Agree** |

*Encoding notes: N = 16 for every item — no respondent used the *Not Applicable* option, so no item lost a case. Only the 28 linear-scale items enter the means; the questionnaire's checkbox and multiple-choice items (Q12, Q16, Q18, Q30, Q36, Q37) are reported as frequencies in the narrative below. Each characteristic score is the unweighted average of its items' weighted means, and its SD is computed over all responses pooled within the characteristic; the overall score is the unweighted average of the eight characteristic means as defined in §4.4, computed from unrounded values (displayed means are rounded to two decimals).*

**Reading of the Form N results.** Every characteristic mean falls inside the 4.20–5.00 *Strongly Agree* band of Table 4.11 — the lowest is *Compatibility* (4.34) and the highest is *Reliability* (4.50) — so everyday users rate all eight evaluated ISO/IEC 25010 characteristics as satisfied. This perception aligns with the built-in quality measured in §4.2, where the same build passed 582 automated tests and 191 end-to-end checks with zero failures. Dispersion is moderate (pooled SD ≈ 1.0) and is largely explained by one highly critical respondent who marked 22 of the 28 items with the lowest score (per-respondent mean 1.32); two further respondents were reserved (3.61 and 3.79), while the remaining thirteen averaged 4.57 or higher. Following rule 3 of §4.4, the open-ended items are quoted here: 7 of the 16 respondents answered them — five reported nothing to fix, one suggested interface polish ("Ui"), one suggested better product pictures ("The picture of the product"), and one comment praised the site ("Nice website").

The non-scaled items point the same way. For Q16 (longest wait before giving up), no respondent reported abandoning a page after more than 30 seconds — 3 never waited noticeably, 9 waited a few seconds, and 4 waited around 10–30 seconds. For Q30, 15 of 16 reported none of the listed negative experiences and one reported an item shown as available that turned out to be out of stock. For Q36, every respondent found new-device setup instant or easy (2 used only one device). For Q37, 7 respondents already knew about or used the home-screen install while 9 were unaware of it — an adoption point worth promoting, as noted in Chapter V. On Q12 (features that worked exactly as expected), respondents ticked catalog search/browse (15), product details (15), cart and checkout (13), pet-food recommendations (12), payment recording and official receipt (12), service booking (11), promotions and availability updates (10), product reviews (9), and support/FAQ (9).

**Table 4.9. Evaluation of the System by IT Expert Respondents (Form T), per ISO 25010 Characteristic**

| ISO 25010 Characteristic | Items | No. of Items | Weighted Mean | SD | Interpretation |
|---|---|---:|---|---|---|
| Functional suitability | Q5–Q10 | 6 | [FILL] | [FILL] | [FILL] |
| Performance efficiency | Q11–Q15 | 5 | [FILL] | [FILL] | [FILL] |
| Compatibility | Q16–Q19 | 4 | [FILL] | [FILL] | [FILL] |
| Usability | Q20–Q23 | 4 | [FILL] | [FILL] | [FILL] |
| Reliability | Q24–Q27 | 4 | [FILL] | [FILL] | [FILL] |
| Security | Q28–Q34 | 7 | [FILL] | [FILL] | [FILL] |
| Maintainability | Q35–Q39 | 5 | [FILL] | [FILL] | [FILL] |
| Portability | Q40–Q43 | 4 | [FILL] | [FILL] | [FILL] |
| **Overall** | | **39** | **[FILL]** | **[FILL]** | **[FILL]** |

**Table 4.10. Side-by-Side Comparison of the Two Respondent Groups**

| ISO 25010 Characteristic | Non-IT respondents (mean) | IT experts (mean) | Difference | Reading |
|---|---|---|---|---|
| Functional suitability | 4.43 | [FILL] | [FILL] | [FILL] |
| Performance efficiency | 4.48 | [FILL] | [FILL] | [FILL] |
| Compatibility | 4.34 | [FILL] | [FILL] | [FILL] |
| Usability | 4.47 | [FILL] | [FILL] | [FILL] |
| Reliability | 4.50 | [FILL] | [FILL] | [FILL] |
| Security | 4.44 | [FILL] | [FILL] | [FILL] |
| Portability | 4.44 | [FILL] | [FILL] | [FILL] |
| Maintainability | — (not rated) | [FILL] | — | Rated only by technical respondents |

*The Non-IT column is encoded from the 16 Form N responses of 22 October 2026 (Table 4.8); the expert column, the differences, and the per-row readings will be completed when Form T closes.*

*Interpretive note for Table 4.10: a substantially higher expert mean than user mean indicates a system that is technically sound but whose experience fails everyday users — usability and performance work should be prioritized. A higher user mean than expert mean indicates satisfied users with structural debt (maintainability, security hardening) that should be addressed before scaling.*

## 4.4 Statistical Result Interpretation

The weighted means obtained in §4.3.2 were interpreted using the following scale, which is the standard agreement-interpretation table for five-point Likert items:

**Table 4.11. Interpretation of Weighted Mean**

| Weighted Mean | Interpretation |
|---|---|
| 4.20 – 5.00 | Strongly Agree / Very High |
| 3.40 – 4.19 | Agree / High |
| 2.60 – 3.39 | Neutral / Moderate |
| 1.80 – 2.59 | Disagree / Low |
| 1.00 – 1.79 | Strongly Disagree / Very Low |

The weighted mean for each item was computed as:

> WM = (Σ f × w) ÷ N

where *f* is the frequency of respondents per scale point, *w* is the weight of that point (1 to 5), and *N* is the total number of respondents who answered the item. Items answered *Not Applicable* by a respondent were excluded from that item's *N*. The overall score for each questionnaire is the unweighted average of the eight characteristic means; equal weighting was used because the evaluation aims to describe the system's quality holistically rather than privilege one dimension.

Beyond the numeric interpretation, the following rules were applied when reading the results:

1. **Characteristic-level reading.** Any characteristic mean of **4.20 and above** is reported as evidence that the corresponding ISO 25010 requirement is satisfied and is cited alongside the objective test results from §4.2 (for example, a high *reliability* score is corroborated by the zero-failure outcome of the 582 test cases and the 191 E2E checks). A mean **below 3.40** (below "Agree") is treated as a finding and is discussed explicitly in Chapter V with a corresponding recommendation.
2. **Standard deviation.** A high SD within a characteristic means respondents disagreed strongly; such characteristics are reported with that caveat rather than by the mean alone.
3. **Open-ended responses.** Representative comments from the questionnaires' final paragraph items are quoted in the narrative to explain *why* a score is high or low; these quotes are attached in the appendix.
4. **Corroboration principle.** Questionnaire scores measure *perceived* quality; the system test plan (§4.2) measures *built-in* quality. Where the two disagree — for example, if perceived security is low while the security tests all pass — the disagreement itself is reported, since it indicates a communication or interface problem rather than a technical one.

---

*Next: Chapter V (Summary of Findings, Conclusion, and Recommendation) — the findings listed there should cite (a) the characteristic means from Tables 4.8–4.9, (b) the zero-failure test result from Table 4.3, and (c) the honest limitations recorded in §1.3.2 of Chapter I.*
