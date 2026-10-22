# System Flowcharts — Whiskers Petshop

Standard flowchart symbols used throughout:

| Shape | Meaning | Fill | Example |
|---|---|---|---|
| Stadium (rounded ends) | **Terminator** — Start / End | Yellow `#F6CB4F` | Start, Logout |
| Rectangle | **Process** — action by user or system | Gray `#E8E8E8` | Compute totals, Update order status |
| Diamond | **Decision** — Yes/No branch | Blue `#4472C4`, white text | Has an account? |
| Parallelogram | **Input / Output** — data entering or leaving | Gray `#E8E8E8` | Enter pet data, Email receipt |
| Cylinder | **Database** — stored data | Gray `#E8E8E8` | Orders DB, Products DB |
| Circle | **On-page connector** — flow continues at the matching letter | White | A, B, C |

Color scheme (classDef applied in every Mermaid block below):

```mermaid
classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
classDef db fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
```

**ANSI/ISO 5807 compliance:**

- Every path begins at a **Start terminator** and ends at an **End terminator** (no dead ends).
- Flow is strictly **top-to-bottom** — no reversed (upward) flowlines. Loops return via a circled on-page connector (customer connector **C** returns to *Browse*).
- Every decision has exactly **one entry and two labeled exits** (Yes/No), leaving from the diamond's side points.
- **Maximum two flowlines per symbol.** Fan-outs are drawn as *decision cascades*: each diamond asks about one module — Yes performs it and flows to the next diamond, No skips to the next diamond — so no shape ever has more than two lines in or two lines out.
- Flowlines never cross; merges are shown as multiple arrows entering one symbol.
- Text is horizontal, centered, and reads left-to-right.
- **Color scheme (capstone standard):** yellow terminators, blue decision diamonds, gray process/I-O/database symbols, white connectors.

**Print layout:** each figure is split into vertical columns so it fits A4 without shrinking the text. The flow leaves one column through a circled connector and resumes at the same letter at the top of the next column (customer uses A–C; staff uses A–B; admin uses A–D). The stitched PNGs in `C:\Users\USER\Downloads\` are:

| File | Figure | Columns | Size (px) |
|---|---|---|---|
| `flowchart-customer.png` | Figure 3.3.6 — Customer | 3 (connectors A, B, C) | 2156 × 2356 |
| `flowchart-staff.png` | Figure 3.3.5 — Staff | 3 (connectors A, B) | 1858 × 2128 |
| `flowchart-admin.png` | Figure 3.3.4 — Admin | 5 (connectors A, B, C, D) | 2492 × 1974 |

Paper figure numbering: **Figure 3.3.4 — Admin**, **Figure 3.3.5 — Staff**, **Figure 3.3.6 — Customer** (Chapters may renumber after re-shoot — keep this order).

---

## Customer Side (Figure 3.3.6)

Column 1 — browse to connector **A**:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px"}}}%%
flowchart TD
    S(["START: Customer opens the website"]) --> B[/Browse and search catalog/]
    KC(("C")) --> B
    B --> V["View product details and pet food recommendations"]
    V --> A["Add to cart - stock and price re-checked"]
    A --> CO{"Proceed to checkout?"}
    CO -- No --> KC2(("C"))
    CO -- Yes --> LG{"Registered customer?"}
    LG -- No --> LR[/Register or log in/]
    LG -- Yes --> KA(("A"))
    LR --> KA
    classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class S term
    class CO,LG dec
    class B,V,A,LR proc
    class KA,KC,KC2 conn
```

(Connector **C** at the top of this column is where the *Proceed to checkout? — No* branch re-enters the flow to keep browsing — an ANSI-compliant alternative to an upward loop arrow.)

Column 2 — connector **A** to connector **B**:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px"}}}%%
flowchart TD
    KA2(("A")) --> T[/Shipping address, promo code, order total/]
    T --> PM{"Choose payment method"}
    PM -- "GCash / Maya QR" --> QR["Display QR - staff verify payment"]
    PM -- "Cash on Delivery" --> COD["Pay upon delivery"]
    QR --> DB[("Orders DB - order and payment records")]
    COD --> DB
    DB --> KB(("B"))
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef db fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class PM dec
    class T,QR,COD proc
    class DB db
    class KA2,KB conn
```

Column 3 — connector **B** to end:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px"}}}%%
flowchart TD
    KB2(("B")) --> CF["Confirmation page and emailed official receipt"]
    CF --> ST["Order status update emails from staff"]
    ST --> FB{"Submit review or open support request?"}
    FB -- Yes --> RV[/Ratings, comments, and support messages/]
    FB -- No --> E(["END: Transaction complete"])
    RV --> E
    classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class FB dec
    class CF,ST,RV proc
    class E term
    class KB2 conn
```

---

## Staff Side (Figure 3.3.5)

Column 1 — login to connector **A**:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px"}}}%%
flowchart TD
    S(["START: Staff logs in"]) --> AU["Authenticate email and password"]
    AU --> RC{"Role check"}
    RC -- "Customer account" --> DENY["Access denied - staff functions only"]
    DENY --> ED(["END: Session terminated"])
    RC -- "Staff account" --> SU{"State-changing action?"}
    SU -- Yes --> ST["STEP-UP: Re-enter password - 403 until verified"]
    SU -- No --> KA(("A"))
    ST --> KA
    classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class S,ED term
    class RC,SU dec
    class AU,DENY,ST proc
    class KA conn
```

Column 2 — connector **A** to connector **B** (module cascade — max two flowlines per symbol):

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px", "edgeLabelBackground": "#FFFFFF"}}}%%
flowchart TD
    KA2(("A")) --> M1{"Manage orders?"}
    M1 -- Yes --> OM["Update order status - customer emailed"]
    OM --> M2
    M1 -- No --> M2{"Monitor payments?"}
    M2 -- Yes --> PM["Verify GCash / Maya QR payments"]
    PM --> KB(("B"))
    M2 -- No --> KB
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class M1,M2 dec
    class OM,PM proc
    class KA2,KB conn
```

Column 3 — connector **B** to end:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px", "edgeLabelBackground": "#FFFFFF"}}}%%
flowchart TD
    KB2(("B")) --> M3{"Edit products?"}
    M3 -- Yes --> PD["Limited fields - no cost or supplier"]
    PD --> M4
    M3 -- No --> M4{"Reply to support?"}
    M4 -- Yes --> SR["Reply emailed to customer"]
    SR --> AL
    M4 -- No --> AL
    AL[("Audit Log - actions and sign-ins recorded")] --> E(["END: Staff logs out"])
    classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef db fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class M3,M4 dec
    class PD,SR proc
    class AL db
    class E term
    class KB2 conn
```

---

## Admin Side (Figure 3.3.4)

Column 1 — login to connector **A**:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px"}}}%%
flowchart TD
    S(["START: Administrator logs in"]) --> AU["Authenticate email and password"]
    AU --> ST["STEP-UP: Re-enter password - 403 until verified"]
    ST --> KA(("A"))
    classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class S term
    class AU,ST proc
    class KA conn
```

Column 2 — connector **A** to connector **B** (module cascade — max two flowlines per symbol):

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px", "edgeLabelBackground": "#FFFFFF"}}}%%
flowchart TD
    KA2(("A")) --> M1{"View analytics and reports?"}
    M1 -- Yes --> AN["Sales, trends, margins - dashboard and reports"]
    AN --> M2
    M1 -- No --> M2{"Manage products?"}
    M2 -- Yes --> PD["Pricing, archive, CSV import and export"]
    PD --> KB(("B"))
    M2 -- No --> KB
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class M1,M2 dec
    class AN,PD proc
    class KA2,KB conn
```

Column 3 — connector **B** to connector **C**:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px", "edgeLabelBackground": "#FFFFFF"}}}%%
flowchart TD
    KB2(("B")) --> M3{"Manage promotions?"}
    M3 -- Yes --> PR["Percent, fixed, free-shipping codes"]
    PR --> M4
    M3 -- No --> M4{"Edit content and settings?"}
    M4 -- Yes --> CS["Banners, navigation, FAQs, policies, site settings"]
    CS --> KC(("C"))
    M4 -- No --> KC
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class M3,M4 dec
    class PR,CS proc
    class KB2,KC conn
```

Column 4 — connector **C** to connector **D**:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px", "edgeLabelBackground": "#FFFFFF"}}}%%
flowchart TD
    KC2(("C")) --> M5{"Manage customers and roles?"}
    M5 -- Yes --> CR["Change account roles - user / staff / admin"]
    CR --> M6
    M5 -- No --> M6{"Reply to support?"}
    M6 -- Yes --> SR["Reply emailed to customer"]
    SR --> KD(("D"))
    M6 -- No --> KD
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class M5,M6 dec
    class CR,SR proc
    class KC2,KD conn
```

Column 5 — connector **D** to end:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 12, "rankSpacing": 20}, "themeVariables": {"fontSize": "12px", "edgeLabelBackground": "#FFFFFF"}}}%%
flowchart TD
    KD2(("D")) --> M7{"View audit logs?"}
    M7 -- Yes --> AL["Who, what, old value to new value"]
    AL --> DB
    M7 -- No --> DB[("Databases - Orders, Payments, Products, Content, Accounts, Audit")]
    DB --> E(["END: Admin logs out"])
    classDef term fill:#F6CB4F,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef proc fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef dec fill:#4472C4,stroke:#333333,stroke-width:1.5px,color:#FFFFFF
    classDef db fill:#E8E8E8,stroke:#333333,stroke-width:1.5px,color:#111111
    classDef conn fill:#FFFFFF,stroke:#333333,stroke-width:1.5px,color:#111111
    class M7 dec
    class AL proc
    class DB db
    class E term
    class KD2 conn
```

---

*Sources: these diagrams reflect the implemented system (single Express API, Supabase/Postgres, JWT + step-up, Brevo email). Each column is rendered separately with mermaid-cli (white background, scale 2) and stitched side by side — see the render notes in the repository history, or paste a block into https://mermaid.live for an editable view.*

---

## Figure descriptions (for Chapter III prose)

### Figure 3.3.6. System Flowchart — Customer

The customer flow begins when the user opens the Whiskers Petshop website and browses the product catalog through search, brand, or category filters. Selecting a product displays its full details — description, ingredients, feeding guide, price, and stock availability. The customer may optionally set up a pet profile by entering the pet's health condition, allergies, and dietary needs; this input is processed by the rule-based recommendation engine, which returns suitable food products for that pet. Items are added to the cart, where the system re-checks stock availability and the current price before the customer proceeds to checkout. An account is required to complete a purchase, so unregistered users are directed to register or log in. At checkout, the customer enters a shipping address and contact number, optionally applies a promo code (validated for type, limits, and validity window), and the system computes the order total, adding the shipping fee unless the free-shipping threshold is met. Two payment paths are offered: GCash/Maya QR transfer, where the payment instructions are displayed and verified by store staff before fulfillment, and cash on delivery, where payment is collected upon receipt of the order. Once the order is recorded, the confirmation page is displayed and an official receipt is emailed to the customer. Order status updates are emailed as staff process the order. Finally, the customer may rate a purchased product from 1 to 5 stars and may open a support request, to which staff replies by email.

### Figure 3.3.5. System Flowchart — Staff

The staff flow begins with authentication using the staff account's email and password, verified through Supabase JWT tokens. The system validates the credentials and checks the account's role, restricting access to staff functions only — cost prices, suppliers, and role management are hidden from this role. Before any state-changing action (such as changing an order status or editing a product), the system enforces step-up re-verification: the staff member must re-enter their password and receives an HTTP 403 response until this confirmation is satisfied, protecting the account against unauthorized use. The staff member then selects a module from the dashboard. In **Order Management**, orders are viewed and their statuses updated, which automatically emails a status notification to the customer. In **Payment Monitoring**, GCash/Maya QR payments submitted by customers are checked and confirmed, releasing the order for fulfillment. In **Product Management**, staff may add or edit product records — name, description, price, stock quantity, and images — which are written to the Products Database; cost and supplier fields remain restricted to administrators. In **Support Replies**, staff read and reply to customer requests, with the reply delivered to the customer's email. Staff may also view the content published by the administrator. Every action and sign-in is recorded in the audit log, and the flow ends when the staff member logs out.

### Figure 3.3.4. System Flowchart — Administrator

The administrator flow begins with authentication and the same step-up password re-verification required before any state-changing action. From the dashboard, the administrator selects from ten modules. **Analytics and Reporting** queries the orders, payments, and events data to produce sales figures, product trends, and margins computed from the per-line cost snapshots, displayed on the dashboard and in reports. **Product Management** allows creating, editing, pricing, archiving, and restoring products, with automatic price history and CSV import/export, written to the Products Database. **Promotions** lets the administrator create and manage promo codes — percentage, fixed-amount, or free-shipping — with scopes, usage limits, and validity windows. The **Content Management System** covers banners, home sections, navigation, frequently asked questions, and policy pages, while **Site Settings** holds the shipping fee, free-shipping threshold, payment methods with QR images, and the maintenance mode switch; every content change invalidates the server cache so shoppers see the update on their next visit. **Customer and Role Management** allows viewing customers and changing account roles (user, staff, admin). **Support Replies** delivers responses to customers by email. Finally, **Audit Logs** displays the complete audit trail — who changed what, from which old value to which new value, including all sign-in records. Every administrator write is recorded before the session ends at logout.
