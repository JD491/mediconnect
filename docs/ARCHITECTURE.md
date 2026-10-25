# Architecture

## System overview

MediConnect is a **Supabase-native** app: there is no separate backend
service for anything except payment verification. The frontend
(React 18 + Vite, incrementally TypeScript) talks directly to Postgres
through Supabase's auto-generated REST API (`@supabase/supabase-js`),
protected entirely by Row Level Security. The only server-side compute is
two small Deno Edge Functions for Razorpay payment creation/verification —
everything else (business rules, validation, notifications, audit logging)
lives in the database as triggers and RPC functions.

```
Browser (React SPA)
   │  supabase-js (anon key, JWT per request)
   ▼
Supabase
   ├─ PostgREST  → Postgres (RLS-enforced on every table)
   ├─ Auth       → JWT issuance, session refresh
   ├─ Storage    → prescriptions bucket (private, RLS-enforced)
   ├─ Realtime   → logical replication → postgres_changes subscriptions
   └─ Edge Functions (Deno, service_role)
        ├─ razorpay-create-order   → api.razorpay.com
        └─ razorpay-verify-payment → api.razorpay.com
```

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

Each role gets its own dashboard shell (`components/DashboardShell.jsx`)
with role-specific nav, rendered under a lazy-loaded route
(`pages/{role}/...Dashboard.jsx`) wrapped in an `ErrorBoundary` so a bug in
one role's pages can't take down the whole app.

## Data flow: placing an order (representative example)

1. Customer builds a cart (`cart_items`, one row per stock item).
2. Checkout wizard (`Cart.jsx`) computes totals client-side via the pure,
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
│                   orderStatus.ts, cartMath.ts, symptomEngine.js
├── types/          database.types.ts (hand-mirrored; regenerate via
│                   `supabase gen types` against your live project)
├── components/     DashboardShell, NotificationBell, ErrorBoundary,
│                   Reveal (scroll animation), UIStates (loading/empty/error)
├── pages/
│   ├── auth/       Login, Signup
│   ├── patient/    Marketplace, Cart (5-step checkout), Orders, Prescriptions...
│   ├── nurse/      Vitals, Tasks, Notes
│   ├── doctor/     Appointments, Availability, Profile
│   ├── store/      Inventory, Orders, Prescriptions, Coupons, Reports
│   ├── admin/      Users, Stores, Doctors, Catalog, Reviews, Audit Logs
│   └── shared/     Landing, Emergency
└── __tests__/      Vitest + React Testing Library

supabase/
├── migrations/     0001–0011, additive only, see README Quick Start for order
└── functions/      razorpay-create-order, razorpay-verify-payment
```

## Why the codebase is JS + TS, not 100% TypeScript

`lib/`, `types/`, `components/UIStates.tsx`, `App.tsx`, and new code are
strictly-typed TS. The ~40 existing page components remain `.jsx`. This is
a deliberate incremental ("strangler fig") migration, enabled by
`allowJs: true` in `tsconfig.app.json`: JS pages already get real type
checking on every call into the typed `lib/` modules (a typo'd Supabase
column name inside `payments.ts` would be caught even though the page
calling it is plain JS), while a full-codebase conversion — which can't be
verified against a live Supabase project from this environment — isn't
risked as an unverified, unreviewable diff. Convert a page to `.tsx`
whenever you're already touching it for other reasons.
