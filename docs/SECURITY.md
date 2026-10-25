# Security

This document is the threat-model writeup for MediConnect: what's protected,
how, and — just as importantly — what isn't verified yet because it's never
been run against a live Supabase project.

## Threat model summary

| Actor | Can do | Cannot do |
|---|---|---|
| Anonymous | View the landing page, sign up | Read/write any table |
| Customer | Own cart/orders/wishlist/reviews/prescriptions; browse public catalog | Touch another user's rows; set `payment_status`/`total_amount`/etc. on their own order; approve their own prescription |
| Store owner | Manage own store's stock/orders/coupons/prescriptions | Touch another store's data; self-approve their store |
| Doctor | Manage own availability/appointments/profile | Touch another doctor's patients |
| Nurse | Record vitals/tasks/notes for assigned patients | Escalate their own role |
| Admin | Everything, including override transitions | (Admin is fully trusted by design — see "Trusting admin" below) |
| Edge Function (`service_role`) | Anything, but code is narrowly scoped to payment verification and AI proxying | N/A — trusted by architecture, not by policy |

## Authentication & session handling

Supabase Auth issues short-lived JWTs; `AuthContext.tsx` holds the session
and the corresponding `profiles` row (which carries `role`). Every
`supabase-js` call automatically attaches the current JWT, which Postgres
reads via `auth.uid()` / `auth.role()` inside RLS policies and triggers.
There is no separate app-level session store — the JWT *is* the identity.

## Row Level Security highlights

- **Enabled on every table**, default-deny.
- **No column-level RLS in Postgres** — where a role needs row-level UPDATE
  access but must not touch specific columns (e.g. a customer cancelling
  their own order but never setting `payment_status: 'paid'`), a
  `BEFORE INSERT OR UPDATE` trigger (`protect_order_financial_fields`,
  `0009`–`0011`) silently reverts protected columns to their `OLD` value
  unless the actor is `service_role`, admin, or a narrowly-scoped
  legitimate exception (see below).
- **Anti-privilege-escalation triggers**: a customer cannot rewrite their
  own `profiles.role`/`status`; a store owner/doctor cannot self-approve
  their own pending application (`prevent_self_role_escalation`,
  `prevent_self_approval`, `0005`).
- **Order status transitions are graph-enforced in the database**
  (`trg_enforce_order_status_transitions`, `0009`): `pending → confirmed →
  preparing → ready_for_dispatch → out_for_delivery → delivered`, plus
  cancellation from any non-terminal state and
  `delivered → refund_requested → refunded`. A direct API call attempting
  `pending → delivered` raises a Postgres exception. Mirrored (and
  unit-tested) client-side in `lib/orderStatus.ts`.
- **The one legitimate customer payment_status exception**: a customer may
  set their *own* order to `status: 'cancelled', payment_status: 'failed'`
  **only when** `old.payment_status = 'processing'` — i.e. abandoning a
  Razorpay checkout that's already mid-flight. This is the single narrow
  carve-out in an otherwise total lock on that column for non-store-owner,
  non-admin actors.

## Payment verification (Razorpay)

**A payment is never marked "paid" by the frontend.** The flow:

1. `orders` row created (unpaid, `pending`, via the app).
2. `razorpay-create-order` Edge Function (service_role): reads the order's
   `total_amount` **from the database**, not the request body; creates a
   Razorpay order with `payment_capture: 1`; rejects if the order is
   already paid or cancelled.
3. Razorpay Checkout widget runs in the browser.
4. `razorpay-verify-payment` Edge Function does two independent checks
   before touching `payment_status`:
   - Recomputes the HMAC-SHA256 signature server-side using
     `RAZORPAY_KEY_SECRET` (never sent to the client).
   - Calls Razorpay's own Payments API to confirm `status: 'captured'`,
     `currency: 'INR'`, and that the amount matches the order exactly.
   - Rejects if this `razorpay_payment_id` is already attached to a
     *different* order (checked in-function, and backstopped by a DB
     `UNIQUE` constraint).
5. Only after all of the above does `payment_status` become `'paid'`.

**Secrets**: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are Supabase Edge
Function secrets (`supabase secrets set ...`), never frontend `.env`
variables. The public Key ID is returned to the client at checkout time by
the create-order function itself — that's the only Razorpay credential the
browser ever sees.

Appointments reuse the same functions with `kind: 'appointment'`; the amount
is read from `doctors.consultation_fee` server-side, and a unique partial
index (`razorpay_payment_id`) prevents one payment from settling two
appointments.

## AI health features

- `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) are Edge Function secrets
  only. The browser never receives them; it calls the `gemini-health`
  function through the Supabase client, so requests still carry a valid
  Supabase JWT (verified by the platform's default `verify_jwt`).
- If the secret is missing or Gemini fails, the client falls back to
  deterministic local logic in `lib/aiHealth.ts` / `lib/prescriptionOcr.ts`;
  no AI output is required for any clinical or payment action to succeed.
- Model output is treated as advisory: red-flag symptoms are escalated
  locally and cannot be downgraded by a model response, and OCR text is
  always shown as editable before medicines are added to a cart.
- A scanned prescription is stored in the browser session (not a public URL)
  and is auto-attached at checkout only for stores that require an Rx.

## Prescription privacy

- Storage bucket (`prescriptions`) is **private**, never publicly readable.
- Upload policy validates, at the storage-RLS layer (not just the
  frontend): the uploader owns the order/store the file path encodes, file
  type is PDF/JPEG/PNG/WebP, and size ≤ 5MB.
- Viewing a file requires a signed URL (5-minute expiry) generated
  server-side per request — no file has a stable public link.
- `reviewed_by`/`reviewed_at` track who approved/rejected — store owners
  see only their own store's prescriptions.

## Price & coupon integrity

`total_amount` is never trusted from the client past order creation. A
statement-level trigger recomputes it from `order_items.quantity ×
stock.price` (the *current* authoritative price, correcting any tampered
`order_items.price` in the same pass) immediately after items are
inserted, and independently re-derives any coupon discount from the real
`coupons` row rather than trusting a claimed `discount_amount`. Coupon
usage-limit enforcement is row-locked (`redeem_coupon`, `FOR UPDATE`) so
two simultaneous checkouts can't both slip through a `usage_limit: 1`
coupon.

## Audit logging

`audit_logs` has **no client insert policy at all** — every row is written
by a `SECURITY DEFINER` trigger (store/doctor approval changes, profile
role/status changes, medicine enable/disable), readable only by admin.
Nothing about who can *write* an audit entry is configurable from the
client, by design.

## Trusting admin

Admin is treated as a fully-trusted role throughout — every hardening
trigger explicitly excepts `public.is_admin()`. This is a deliberate
scope boundary, not an oversight: MediConnect has no concept of
super-admin vs. scoped-admin, so "admin can do anything" is the current
threat model. If you need tiered admin permissions, that's a genuine
follow-on piece of work (a `permissions` table + policy changes), not
something silently assumed here.

## What is verified vs. what is reviewed-only

Everything above has been checked by static analysis (SQL syntax/paren
balance, cross-referencing every `.from()`/`.rpc()`/`.invoke()` call
against real schema objects, manual trace of trigger interaction order)
and, where possible, automated tests (`lib/orderStatus.test.ts`,
`lib/cartMath.test.ts`, `__tests__/roleGuards.test.ts`). **None of the SQL
has been executed against a live Postgres instance from this environment.**
Run the full migration sequence against a staging Supabase project and
exercise the workflows in `README.md`'s testing checklist before trusting
this in production.
