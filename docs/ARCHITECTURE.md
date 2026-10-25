# Architecture

## System overview

MediConnect is a **Supabase-native** app: there is no separate backend
service for anything except payment verification and optional AI calls. The
frontend (React 18 + Vite, incrementally TypeScript) talks directly to
Postgres through Supabase's auto-generated REST API (`@supabase/supabase-js`),
protected entirely by Row Level Security. The only server-side compute is
three small Deno Edge Functions — two for Razorpay payment
creation/verification and one optional Gemini gateway for health chat, triage
and prescription OCR — everything else (business rules, validation,
notifications, audit logging) lives in the database as triggers and RPC
functions.

```
Browser (React SPA)
   │  supabase-js (anon key, JWT per request)
   ▼
Supabase
   ├─ PostgREST  → Postgres (RLS-enforced on every table)
   ├─ Auth       → JWT issuance, session refresh
   ├─ Storage    → prescriptions bucket (private, RLS-enforced)
   ├─ Realtime   → logical replication → postgres_changes subscriptions
   └─ Edge Functions (Deno, secrets server-side)
        ├─ razorpay-create-order   → api.razorpay.com  (service_role)
        ├─ razorpay-verify-payment → api.razorpay.com  (service_role)
        └─ gemini-health (optional) → Gemini API (chat / triage / ocr)
```

Every AI surface degrades gracefully: `lib/aiHealth.ts` and
`lib/prescriptionOcr.ts` contain deterministic local engines, so the
assistant, symptom checker and prescription scan keep working when
`GEMINI_API_KEY` is unset or the network is unavailable. Red-flag symptoms
escalate locally and can never be downgraded by a model response.

Why this shape: every route a hand-rolled Express backend would expose
(auth, medicines, stores, orders, appointments...) maps 1:1 to a Postgres
table + RLS policy. That's less code to own, and Realtime comes for free.
The one thing that must never run in the browser — verifying a payment
using a secret key — is isolated into Edge Functions, which is the minimum
server-side surface, not a return to a full backend.

## Role model

Five roles, one `role` column on `profiles`, enforced in three independent
places that must all agree:

| Layer | Mechanism |
|---|---|
| Routing | `App.tsx`'s `Protected` component + `isRoleAllowed()` — client-side, UX only |
| Data access | RLS policies per table, keyed off `auth.uid()` and `profiles.role` |
| Mutation safety | Triggers (e.g. `protect_order_financial_fields`) that override policy shape |

**The routing check is never trusted for security** — it only decides what
to render. If someone bypasses it (devtools, direct API calls), RLS is the
actual gate. See `SECURITY.md` for the specific policies.

Each role gets its own dashboard shell (`components/DashboardShell.tsx`)
with role-specific nav, rendered under a lazy-loaded route
(`pages/{role}/...Dashboard.tsx`) wrapped in an `ErrorBoundary` so a bug in
one role's pages can't take down the whole app.

## Data flow: placing an order (representative example)

1. Customer builds a cart (`cart_items`, one row per stock item).
2. Checkout wizard (`pages/patient/Cart.tsx`) computes totals client-side via the pure,
   tested `computeCartTotals()` (`lib/cartMath.ts`) — this is a *preview*,
   not the source of truth.
3. On submit: `orders` row inserted (trigger forces `status: 'pending'`,
   unpaid, regardless of client input) → `order_items` inserted.
4. A statement-level trigger (`validate_order_total_after_items`)
   immediately recomputes `total_amount` from `order_items × stock.price`
   (the *real*, current price — not whatever the client sent) and
   re-derives any coupon discount from the actual `coupons` row. This is
   the actual source of truth for what the customer owes.
5. If prescription-required items are present, a file is uploaded to the
   private `prescriptions` bucket and a `prescriptions` row created.
6. If paying online: two Edge Function round-trips (create → Razorpay
   Checkout widget → verify) before `payment_status` can become `'paid'`.
7. Triggers fire notifications to the store owner (new order) and, later,
   the customer (status changes) — all via `notifications`, consumed by
   the realtime `NotificationBell` in every dashboard.
8. Store owner advances `orders.status` through the fulfillment graph;
   a trigger (`trg_enforce_order_status_transitions`) rejects any jump that
   isn't in the allowed graph (mirrored client-side in
   `lib/orderStatus.ts#isValidOrderTransition`, unit-tested).

## RLS strategy

Every table has RLS enabled with no default-allow. The recurring patterns:

- **Own-row access**: `user_id = auth.uid()` (cart_items, wishlists, orders-as-customer).
- **Store-scoped access**: `exists (select 1 from stores s where s.store_id = X.store_id and s.owner_id = auth.uid())` (stock, coupons, prescriptions-as-store).
- **Admin override**: `public.is_admin()` OR'd into nearly every policy.
- **Trigger-enforced column protection**: RLS can gate *rows*, not
  individual *columns* — where a customer legitimately needs UPDATE access
  to their own order (to cancel it) but must never touch `total_amount`,
  a `BEFORE UPDATE` trigger (`protect_order_financial_fields`) silently
  reverts protected columns regardless of what the UPDATE statement
  claimed. This pattern — RLS decides *who can touch the row*, a trigger
  decides *which columns actually move* — appears wherever a role needs
  partial write access.

See `SECURITY.md` for the full threat-model writeup of these mechanisms.

## Directory layout

```
frontend/src/
├── lib/            supabaseClient.ts, AuthContext.tsx, payments.ts,
│                   orderStatus.ts, cartMath.ts, aiHealth.ts,
│                   prescriptionOcr.ts, symptomEngine.ts
├── types/          database.types.ts (hand-mirrored; regenerate via
│                   `supabase gen types` against your live project)
├── components/     DashboardShell, NotificationBell, ErrorBoundary,
│                   AIHealthChatbot, MedicineImage, DeliveryBar,
│                   LocationModal, LiveTrackingMap, RevenueReconciliation,
│                   Reveal (scroll animation), UIStates (loading/empty/error)
├── pages/
│   ├── auth/       Login, Signup
│   ├── patient/    Marketplace, Cart (5-step checkout), Orders, Prescriptions,
│   │               PrescriptionScan, SymptomChecker, Tracking...
│   ├── nurse/      VitalsTriage, MedicationTasks, NurseProfile
│   ├── doctor/     Consultations, WritePrescription, Patients, Availability
│   ├── store/      Inventory, Orders, Prescriptions, Coupons, Reports
│   ├── admin/      Users, Stores, Doctors, Catalog, Reviews, Audit Logs
│   └── shared/     Landing, Emergency
└── __tests__/      Vitest + React Testing Library

frontend/public/     manifest.webmanifest, sw.js, offline.html, robots.txt,
                    brand/ + medicine/ SVG assets

supabase/
├── migrations/     0001–0012, additive only, see README Quick Start for order
└── functions/      razorpay-create-order, razorpay-verify-payment,
                    gemini-health (chat / triage / ocr)
```

## TypeScript across the whole frontend

Every file under `frontend/src/` is strict-mode TypeScript (`.ts`/`.tsx`) —
pages, components, hooks, `lib/` and `types/` — and `tsc -b` is clean. The
migration off `.jsx` was done incrementally ("strangler fig") rather than in
one unverifiable pass: typed `lib/` modules were the foundation, then pages
were converted file-by-file behind the existing test suite. `allowJs` is now
off in `tsconfig.app.json`, so a stray `.js`/`.jsx` file would fail the build
instead of silently escaping type-checking. Supabase database types are
hand-mirrored in `types/database.types.ts`; regenerate with
`supabase gen types` after schema changes. Keep new code strictly typed. Supabase database types are hand-mirrored in
`types/database.types.ts`; regenerate with `supabase gen types` after schema
changes. Keep new code strictly typed.
