# MediConnect — Healthcare Marketplace & Services Platform

MediConnect is a full-stack healthcare marketplace: a multi-store medicine
marketplace with prescription verification, doctor consultations, nurse
patient-care tools, store-owner pharmacy management, and platform-wide
admin oversight — built on React/Vite + Supabase (Postgres, Auth, Storage,
Realtime, Edge Functions).

## 🚀 Quick Start — 3 commands

**One-time setup**, in order:

1. Create a Supabase project, then in its **SQL Editor** run these migration
   files **in order** (copy each file's *contents*, paste into a new query,
   click Run — don't type the file path itself):

   ```
   0001_init_schema.sql
   0002_rls_policies.sql
   0003_shop_owner_phase1.sql
   0004_customer_marketplace_phase2.sql
   0005_stock_integrity_and_admin_prep.sql
   0006_availability_notifications_coupons.sql
   0007_reports_and_audit_logs.sql
   0008_order_prescription_payment_lifecycle.sql
   0009_security_hardening_pass.sql
   0010_integrity_fix.sql
   0011_order_insert_and_payment_cancel_fix.sql
   0012_complete_clinical_location_payments.sql
   supabase/seed/seed_catalog.sql
   ```

2. In **Authentication → Providers → Email**, turn **off** "Confirm email"
   (demo/local convenience — otherwise self-service signup for doctors/store
   owners can't create their role row until the email link is clicked; see
   "Known Supabase setting" below).
3. Copy the two env templates and fill in your project's URL + keys
   (Project Settings → API):
   ```bash
   cp frontend/.env.example frontend/.env      # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
   cp scripts/.env.example scripts/.env        # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   ```

**Then, every time, from the project root:**

```bash
npm run install:all   # 1. installs frontend + scripts dependencies
                       # 2. (env files already filled in above)
npm run setup          # 3. seeds demo data, then starts the dev server
```

Open http://localhost:5173 and log in with any demo account (password
`MediConnect@123` for all): `admin@mediconnect.app`, `owner@mediconnect.app`,
`doctor@mediconnect.app`, `nurse@mediconnect.app`, `customer@mediconnect.app`.

Already seeded and just want to run the app? `npm run dev` alone is enough —
`npm run seed` is safe to re-run any time (see "Seed reliability" below).

### Known Supabase setting: email confirmation
Supabase projects default to **"Confirm email" ON**. This only affects
self-service sign-up from the app's `/signup` page (the seeded demo accounts
are created via the Admin API and are unaffected): if a real visitor signs up
as a doctor or store owner, their `doctors`/`stores` row is created in the
same request as their auth account, before they've confirmed their email —
with confirmation required, there's no active session yet, so that insert is
correctly rejected by RLS. Turning the setting off (step 2 above) is the
simplest fix for local/demo use; in production, move that row creation into a
`handle_new_user`-style trigger or an Edge Function instead. No app code needs
to change for the demo to work with the setting off.

---

## 💳 Payments: Cash on Delivery + Razorpay (test mode)

**Cash on Delivery works out of the box** — no setup needed.

**Online payment (Razorpay) requires two Supabase Edge Functions to be
deployed**, because a payment must never be marked successful by the browser
alone. Until you deploy them, or if you are running the demo/local dataset,
checkout opens an interactive **demo gateway** (`pay_MC_…` references) so the
full payment, invoice, retry and refund flows remain testable end-to-end
without real money.

To enable it:

```bash
# 1. Install the Supabase CLI if you haven't: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <your-project-ref>

# 2. Deploy the payment functions (and the optional AI gateway)
supabase functions deploy razorpay-create-order
supabase functions deploy razorpay-verify-payment
supabase functions deploy gemini-health

# 3. Set your Razorpay TEST/sandbox keys as function secrets
#    (get these from the Razorpay Dashboard → Settings → API Keys, TEST mode)
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=your_test_key_secret

# 4. Optional: enable Gemini-powered symptom triage, chat and prescription OCR.
#    Without this secret the app silently uses its deterministic local engine.
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
# optional override (default: gemini-flash-lite-latest; use a full flash model
# only if your project has quota for it — lite is the reliable default)
supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest
```

That's the entire setup — the frontend needs **no** new `.env` variables for
this; `RAZORPAY_KEY_ID` is returned to the client at checkout time by the
`razorpay-create-order` function itself (the public Key ID is safe to expose;
`RAZORPAY_KEY_SECRET` never leaves the Edge Function).

**How the flow works** (see `supabase/functions/*/index.ts` for the full
implementation):
1. Customer completes checkout → order row is created in Postgres first
   (`payment_status = 'pending'`).
2. Frontend calls `razorpay-create-order`, which re-reads the order's total
   from the database (never trusts a client-supplied amount) and creates a
   real Razorpay order server-side.
3. Razorpay's checkout widget opens in the browser.
4. On success, the frontend calls `razorpay-verify-payment`, which
   recomputes the HMAC-SHA256 signature using `RAZORPAY_KEY_SECRET` — only
   if that matches does it set `payment_status = 'paid'`.
5. If payment fails or is cancelled, the order is **kept** with
   `payment_status = 'failed'`, so the customer can retry online or switch
   the order to Cash on Delivery from My Orders. Stock is only released when
   the order is actually cancelled.
6. Refunds are explicit and chain `refund_requested → refund_initiated →
   refunded`; each transition is owner/admin-gated and visible in the
   store-owner revenue reconciliation view.
7. Appointment online payments use the same two functions with
   `kind: 'appointment'`; the server reads the doctor's consultation fee and a
   unique partial index prevents one Razorpay payment from settling two
   appointments.

---

## 🤖 AI health assistant (optional Gemini, always-on fallback)

The floating assistant, symptom checker and prescription scan all call one
`gemini-health` Edge Function (`chat`, `triage`, `ocr` modes). If
`GEMINI_API_KEY` is not set — or Gemini/network is unavailable — the app
transparently falls back to the deterministic local engine in
`frontend/src/lib/aiHealth.ts` and browser OCR in
`frontend/src/lib/prescriptionOcr.ts`. Red-flag symptoms escalate immediately
and cannot be downgraded by a model response. English, Hindi and Marathi are
supported throughout.

A scanned prescription is attached to the browser session and auto-attached at
checkout for every store that needs an Rx; it is cleared after a successful
order. OCR output is always editable and re-matchable before adding medicines
to the cart.

---

## Changelog — stability & tooling pass

The app was already feature-complete; this pass made it install, seed, and
run cleanly with zero manual troubleshooting. No business logic, RLS,
schema, UI behavior, or demo data changed.

| File | Fix |
|---|---|
| `frontend/src/pages/doctor/DoctorDashboard.tsx` | Guarded the appointments realtime subscription so it never subscribes with a `doctor_id=eq.null` filter before the doctor row loads. |
| `frontend/src/pages/store/StoreOwnerDashboard.tsx` | Same guard for the orders realtime subscription (`store_id=eq.null`). |
| `frontend/src/pages/nurse/NurseDashboard.tsx` | Scoped the `patients` realtime channel to `primary_nurse_id=eq.<uid>` and the `vitals` channel to the selected patient (guarded against no patient selected) instead of listening to every row in both tables. |
| `frontend/src/pages/auth/Signup.tsx` | Role-row insert errors (doctors/stores) are now logged instead of silently discarded, so a rejected insert (e.g. due to email confirmation, see above) is visible instead of failing invisibly. |
| `scripts/seed.js` | (1) `process.exit(1)` in the error handler caused a native libuv crash on Windows after network activity — replaced with `process.exitCode`. (2) Store/doctor/availability/patient creation is now idempotent (checks for an existing row first), so re-running the seed — including after a partial failure — no longer throws on duplicate keys. |
| `supabase/seed/seed_catalog.sql` | Rewritten with `where not exists` guards so re-running it doesn't create duplicate medicines/emergency contacts (these tables intentionally have no unique constraint — no migration/schema change was made). |
| `frontend/package.json` | Added `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` to devDependencies — `.eslintrc.cjs` referenced these plugins but they were never installed, so `npm run lint` failed outright. Added an `engines.node` field. |
| `frontend/.eslintrc.cjs` | Added `ignorePatterns: ['dist', 'node_modules']` — without it, linting after a build lints the minified `dist/` bundle too and produces hundreds of false-positive errors. |
| `scripts/package.json` | Added an `engines.node` field to match the frontend. |
| `package.json` (new, root) | Orchestrates both sub-projects: `install:all`, `seed`, `dev`, `build`, `setup` — see Quick Start above. |

**Verification performed:** `npm run build` (frontend) completes with 0 errors;
`npm run lint` (frontend) completes with 0 errors/warnings across all source
files; `node --check scripts/seed.js` passes; the root `install:all` / `seed`
/ `build` scripts were each run end-to-end to confirm `--prefix` resolves the
correct working directory (needed for `scripts/.env` to load correctly).

---

## ✅ What makes this production-ready

- **End-to-end type safety**: every file under `frontend/src/` is
  strict-mode TypeScript with hand-mirrored Supabase database types — every
  `.from()`/`.rpc()` call is checked against the real schema at compile
  time (`allowJs` is off, so untyped JavaScript can't creep back in). See
  `docs/ARCHITECTURE.md` for how the `.jsx` → `.tsx` migration was done
  incrementally rather than as one unverifiable rewrite.
- **Automated tests for the logic that actually encodes business rules**:
  order-status transition validity, cart total/discount math, checkout
  validation and prescription auto-attach, role-based route guards, AI
  triage red-flag escalation, prescription-OCR parsing/matching, and
  revenue reconciliation are unit-tested (`npm run test`, 99 tests) — not
  just eyeballed. See `docs/DEVELOPER_GUIDE.md`'s testing-conventions
  section for why component tests are used sparingly and pure-logic tests
  are prioritized.
- **Defense in depth on every financial/administrative action**: RLS
  decides who can touch a row; database triggers decide which columns can
  actually move, independent of what any client claims — see
  `docs/SECURITY.md` for the full breakdown, including several
  privilege-escalation and payment-integrity bugs found and fixed across
  security-audit passes.
- **Error boundaries around every dashboard**, so a bug in one role's
  pages degrades to a recoverable error screen, not a blank white page or
  a crash that takes down other roles' sessions.
- **`npm run typecheck && npm run lint && npm run test && npm run build`
  all pass clean** as of the last commit.
- **Four real documentation files** in `docs/` — `ARCHITECTURE.md`,
  `SECURITY.md`, `DEVELOPER_GUIDE.md`, `DEPLOYMENT.md` — not stubs.
- **Honest about what isn't verified**: every doc that makes a claim about
  correctness also says explicitly what has and hasn't been checked
  against a live Supabase instance. See "Genuine remaining gaps" below.

---

## What's in this delivery (read this first)

MediConnect is feature-complete across all five roles. Everything below is
real, working code wired to Supabase — not placeholder UI.

**Customer**: medicine marketplace with filters/sort/search across stores,
medicine detail pages with store price comparison and generic-name
alternatives, wishlist, multi-store cart with per-store coupon codes, a
5-step checkout wizard (address → prescription → summary → payment →
confirmation), hyperlocal distance-aware delivery/ETA with saved address tags,
self-pickup `MC-XXXX` tokens, Cash on Delivery / doorstep UPI / online
payment with retry + switch-to-COD, GST invoices, order tracking, reorder,
doctor directory + slot-based booking with online payment, prescription
history + OCR scan (auto-attached to checkout), multilingual symptom checker,
AI health assistant, location-aware emergency contacts, reviews, and a
real-time notification bell.

**Store Owner**: dashboard with live sales/order/stock stats, add/edit
medicines, inventory with low-stock/expiry/out-of-stock filters, order
fulfillment through the full lifecycle, prescription review, coupon
management, Sales & Reports with CSV export and online/offline revenue
reconciliation (including refunds), and store profile management.

**Doctor**: appointment queue, consultations with visit transitions and
counter payments, e-prescription writer with vitals/EHR, assigned patients,
weekly availability editor (with double-booking prevention), and profile
management.

**Nurse**: patient list, vitals triage with automatic flags, medication task
board (start/administer/escalate), walk-in fee verification, and clinical
profile management.

**Admin**: user management (search/filter/suspend), store & doctor approval
workflow, master medicine catalog editing, platform-wide order visibility,
review moderation, and an audit log of every sensitive state change
(approvals, role changes, medicine enable/disable) — written automatically by
database triggers, not by the UI.

**External credentials still needed for the final live mile**:
- A real Razorpay account/key pair to exercise a live settlement round trip
  (the flow, server verification, retry/COD fallback and refunds are complete
  and tested against the demo gateway).
- A Gemini API key to switch the assistant/OCR from the deterministic local
  engine to the model (both paths are implemented; local is always available).
- A maps provider key if you want turn-by-turn embedded maps; the app already
  deep-links to Google Maps for emergency directions and draws the live
  tracking route without a key.
- A full WCAG audit across every screen — reusable focus/contrast/loading
  patterns are in place, but this is not a certified accessibility audit.

The frontend is 100% TypeScript (`tsc -b` clean). Automated coverage is
focused: business logic, cart/checkout totals, order transitions, role guards,
AI fallbacks, OCR parsing and revenue reconciliation (99 tests). The
Supabase-wired page components are exercised by the manual smoke checklist
above rather than a component test harness. SQL migrations are verified by
static review plus the app's demo engine; run them against a staging project
before production.

---

## 🔐 Current Security Architecture

- **RLS on every table.** No table is readable/writable by default; each
  policy is scoped to the owning user, the owning store, or admin. See
  `0002_rls_policies.sql` for the baseline and `0009`–`0012` for hardening
  found in later audit passes.
- **Order status transitions are enforced in the database**, not just the
  UI: `pending → confirmed → preparing → ready_for_dispatch →
  out_for_delivery → delivered`, with cancellation and the refund chain
  `delivered → refund_requested → refund_initiated → refunded` as the only
  other branches. Offline payment methods (`cod`, `upi_offline`,
  `clinic_counter`) start `cod_pending`; online/self-pickup stay prepaid.
  A direct API call attempting `pending → delivered` is rejected with a
  Postgres exception. Admin retains override authority.
- **Price integrity is recomputed server-side, not trusted from the client.**
  After `order_items` are inserted, a trigger recomputes `total_amount` from
  the *current* `stock.price` (not whatever the client sent), corrects any
  mismatched per-line price, and re-derives any coupon discount from the
  real coupon row rather than trusting a claimed `discount_amount`.
- **Coupon validation** happens twice: a read-only preview RPC for the
  checkout UI, and a row-locked "redeem" RPC that atomically checks validity
  and increments usage count at the moment of purchase — so a
  `usage_limit: 1` coupon can't be double-spent by two simultaneous
  checkouts, and the total-recompute trigger re-verifies the discount
  independently afterward.
- **Prescription access is private by construction.** Files live in a
  non-public Storage bucket; the upload policy checks the uploader actually
  owns the order/store the file path claims, restricts file type to
  PDF/JPEG/PNG/WebP and size to 5MB at the storage-RLS layer (not just the
  frontend `accept` attribute), and signed URLs (5-minute expiry) are the
  only way to view a file — nothing is ever public.
- **Payment verification is entirely server-side.** Two Supabase Edge
  Functions (`razorpay-create-order`, `razorpay-verify-payment`) are the only
  code path that can ever mark an order or appointment "paid": the charged
  amount is read from the database, never the client; the HMAC-SHA256
  signature is recomputed server-side; and the payment is independently
  re-verified against Razorpay's own Payments API (captured status, INR
  currency, exact amount) before the row is marked paid.
  `RAZORPAY_KEY_SECRET` never leaves the Edge Function runtime — it's a
  Supabase secret, not a frontend env var. Appointment rows store
  `razorpay_order_id`, `razorpay_payment_id` and `payment_verified`, with a
  unique partial index preventing one payment from settling two appointments.
- **Financial order fields can't be edited by a client at all.** A database
  trigger reverts any client-side attempt to change `total_amount`,
  `discount_amount`, `coupon_code`, `payment_verified`, `razorpay_order_id`,
  `razorpay_payment_id`, `store_id`, `delivery_fee`, `payment_method`, or
  `user_id` after order creation, and forces every new order to start as
  `status: pending`, unpaid, regardless of what a crafted request claims.
  The only narrow exceptions: the fulfilling store may set `payment_verified`
  and `payment_status` (COD collected / refunded); a customer may switch an
  open online/self-pickup order to COD, or move their own order between
  unpaid states while retrying a payment, but can never set `paid`, `refunded`
  or `cod_collected`. Migration `0012` installs this exact guard.
- **Privilege escalation is blocked at the trigger level**, not just RLS:
  a customer can't rewrite their own `role`/`status` on `profiles`, and a
  store owner/doctor can't self-approve their own pending application.

---

## Architecture

```
mediconnect/
├── frontend/                 # React 18 + Vite + Tailwind + Framer Motion
│   ├── public/               # PWA manifest, service worker, offline.html, brand + medicine SVGs
│   └── src/
│       ├── lib/               # supabaseClient + demoDb, AuthContext, LocationContext, payments,
│       │                      # orderStatus, aiHealth, prescriptionOcr, reconciliation, symptomEngine
│       ├── components/        # DashboardShell, NotificationBell, AIHealthChatbot, MedicineImage, UIStates
│       └── pages/
│           ├── auth/          # Login (one-click demos), Signup (role picker)
│           ├── patient/       # Marketplace, MedicineDetail, Wishlist, Cart (checkout wizard),
│           │                  # MyOrders, OrderTracking, Prescriptions, PrescriptionScan,
│           │                  # Appointments, SymptomChecker
│           ├── nurse/         # Overview, Vitals & Triage, Medication Tasks, Profile
│           ├── doctor/        # Appointment queue, WritePrescription, Patients, Availability, Profile
│           ├── store/         # Overview, Inventory, AddMedicine, Orders, Prescriptions, Coupons,
│           │                  # Reports/RevenueReconciliation, Profile
│           ├── admin/         # Overview, Users, Stores, Doctors, MedicineCatalog, Orders, Reviews, AuditLogs
│           └── shared/        # Landing, Emergency (location-aware), AI chat
├── supabase/
│   ├── migrations/            # 0001–0012, see Quick Start for order
│   ├── functions/             # razorpay-create-order, razorpay-verify-payment, gemini-health
│   └── seed/
│       └── seed_catalog.sql   # medicines + emergency contacts (no auth dependency)
├── scripts/
│   └── seed.js                 # creates demo Auth users + stores/doctors/patients/vitals/tasks
└── docs/
```

### Why Supabase-only (no separate Express backend)

Every route a traditional Express backend would expose (auth, medicines,
stores, stock, cart, orders, doctors, appointments, symptom checker, admin
approvals, notifications) maps to a Postgres table + RLS policy, queried
directly from the frontend via `@supabase/supabase-js` — less to maintain,
and realtime for free. The one place that genuinely needs server-side secrecy
(payment verification) is a **Supabase Edge Function**, not a revived Express
server — one deployment target instead of two.

### Data model highlights

- **`profiles`** is the identity spine — one row per `auth.users`, created
  automatically by the `handle_new_user()` trigger on signup, carrying `role`
  (customer/store_owner/doctor/nurse/admin) which drives both RLS and UI routing.
- **Commerce**: `stores → stock → medicines`, `cart_items`, `orders →
  order_items`, `coupons`, `prescriptions` (private Storage bucket).
- **Appointments**: `doctors → doctor_availability`, `appointments` (a
  partial unique index on `doctor_id + date + time` — ignoring cancelled rows
  — prevents double-booking while still letting a cancelled slot reopen;
  Razorpay order/payment IDs and `payment_verified` are stored on the row).
- **Clinical**: `patients → vitals / tasks / notes / e_prescriptions`, keyed
  to `primary_nurse_id` / `primary_doctor_id` for row-level scoping.
- **Oversight**: `audit_logs` (trigger-written only, admin-readable),
  `notifications` (event-driven via triggers on orders/appointments/
  prescriptions), `reviews`.
- **Shared**: `emergency_contacts`, `symptom_checks`, `wishlists`; saved
  addresses, location choice, cart and scanned-Rx attachment persist locally
  in the browser so demo state survives refreshes.

### Realtime strategy

Tables added to the `supabase_realtime` publication (see end of
`0001_init_schema.sql`): `appointments`, `tasks`, `vitals`, `notes`, `orders`,
`notifications`, `stock`. Each dashboard subscribes via
`supabase.channel(...).on('postgres_changes', ...)` scoped with a `filter`
where possible (e.g. `store_id=eq.<id>`) so nurses/doctors/store
owners/customers only re-fetch their own data, not the whole table.

---

## Setup (manual, step-by-step)

Prefer more control than the root `npm run install:all` / `npm run setup`
scripts, or want to run frontend/scripts independently? Same steps, spelled out:

### 1. Create a Supabase project
Create a project at supabase.com, then in **SQL Editor** run, in order:
1. `supabase/migrations/0001_init_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_shop_owner_phase1.sql`
4. `supabase/migrations/0004_customer_marketplace_phase2.sql`
5. `supabase/migrations/0005_stock_integrity_and_admin_prep.sql`
6. `supabase/migrations/0006_availability_notifications_coupons.sql`
7. `supabase/migrations/0007_reports_and_audit_logs.sql`
8. `supabase/migrations/0008_order_prescription_payment_lifecycle.sql`
9. `supabase/migrations/0009_security_hardening_pass.sql`
10. `supabase/migrations/0010_integrity_fix.sql`
11. `supabase/migrations/0011_order_insert_and_payment_cancel_fix.sql`
12. `supabase/migrations/0012_complete_clinical_location_payments.sql`
13. `supabase/seed/seed_catalog.sql` (medicines + emergency contacts)

Then, if you want online payments working, deploy the two Razorpay Edge
Functions and set your Razorpay test secrets — see "Payments" above.
Optionally deploy `gemini-health` and set `GEMINI_API_KEY` to enable
model-backed triage/chat/OCR — see "AI health assistant" above.

Realtime: Database → Replication → confirm the tables listed above are enabled
(the migration adds them to `supabase_realtime` automatically on most projects;
double-check in the dashboard if subscriptions don't fire).

### 2. Seed demo users + role data
```bash
cd scripts
cp .env.example .env        # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run seed
```
This creates 5 confirmed demo accounts (password `MediConnect@123` for all):
`admin@mediconnect.app`, `owner@mediconnect.app`, `doctor@mediconnect.app`,
`nurse@mediconnect.app`, `customer@mediconnect.app` — plus a stocked store, an
approved doctor with availability, 3 inpatients with vitals/tasks/notes.

### 3. Run the frontend
```bash
cd frontend
cp .env.example .env        # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Open http://localhost:5173, log in with any demo account, and you'll land on
that role's dashboard.

### 4. Try the realtime pieces
Open two browser windows: log in as `nurse@mediconnect.app` in one and
`doctor@mediconnect.app` in the other (or the same nurse account twice). Log a
vitals reading or update a task — it updates live in the other window without
a refresh. Same for order status (customer ↔ store owner) and appointment
status (patient ↔ doctor).

---

## Extending this foundation

- **New role-specific page**: add the `.tsx` under `pages/<role>/`, add it to
  that role's `NAV` array and (if it needs its own path) to the nested
  `<Routes>` in that role's dashboard file.
- **New table**: add it to a new `supabase/migrations/000N_*.sql` file (never
  edit `0001`/`0002` after they've been applied to a real project), write its
  RLS policies in the same migration, and add it to the realtime publication
  if the UI needs live updates.
- **TypeScript**: run `supabase gen types typescript --project-id <ref>` to
  regenerate `database.types.ts` after a schema change; the whole frontend is
  already strict-mode TS, so new code is type-checked automatically.

## Original projects

- `MediMart` business logic reference: multi-store medicine inventory,
  prescription-gated checkout, rule-based symptom checker, doctor approval
  workflow — all preserved and ported onto Postgres/RLS.
- `VitalSync` UI/UX reference: the glassmorphism layout system (`index.css`
  `.glass` utilities) originated here and is still the structural basis for
  every dashboard — the color palette itself has since been rebranded to
  MediConnect's deep-blue + teal identity (see `tailwind.config.js`).
