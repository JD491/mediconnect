# Developer Guide

Practical "how do I add X" recipes for this codebase.

## Adding a new page to an existing role dashboard

Example: adding a "Delivery Zones" page to the Store Owner dashboard.

1. Create `frontend/src/pages/store/DeliveryZones.jsx` (or `.tsx` — new
   files should be TS; see `docs/ARCHITECTURE.md`'s note on the JS/TS split).
   Follow the shape every other store page uses:
   ```tsx
   export default function DeliveryZones({ store }) {
     // store.store_id is already scoped to this owner — every query should filter by it
   }
   ```
2. Register the route + nav entry in `StoreOwnerDashboard.jsx`:
   ```jsx
   import DeliveryZones from './DeliveryZones.jsx';
   // in NAV array:
   { to: '/app/store-owner/delivery-zones', icon: <FiMap />, label: 'Delivery Zones' },
   // in <Routes>:
   <Route path="delivery-zones" element={<DeliveryZones store={store} />} />
   ```
   NAV entries and `<Route>`s must match 1:1 — nothing enforces this at
   build time, so double-check before shipping (a small script did this
   cross-check manually during the last audit pass; there's no automated
   test for it yet — a good first contribution).
3. If it needs new data, add the RLS policy + table first (below), *then*
   write the query — don't write a query against a table that doesn't
   have RLS enabled yet.

## Adding a new table + RLS policy

1. Write a new migration file: `supabase/migrations/00XX_description.sql`
   (next sequential number — check `ls supabase/migrations/` first).
   **Never edit an already-numbered migration** once it might have been
   run against any project (including your own past sessions) — always add
   a new one that does `create or replace function` / `alter table` on top.
2. Structure:
   ```sql
   create table if not exists public.delivery_zones (
     zone_id     bigint generated always as identity primary key,
     store_id    bigint not null references public.stores(store_id) on delete cascade,
     pincode     text not null,
     created_at  timestamptz not null default now()
   );

   alter table public.delivery_zones enable row level security;

   drop policy if exists "delivery_zones_read" on public.delivery_zones;
   create policy "delivery_zones_read" on public.delivery_zones
     for select using (true); -- public, or scope it if it shouldn't be

   drop policy if exists "delivery_zones_owner_write" on public.delivery_zones;
   create policy "delivery_zones_owner_write" on public.delivery_zones
     for all using (
       exists (select 1 from public.stores s where s.store_id = delivery_zones.store_id and s.owner_id = auth.uid())
     ) with check (
       exists (select 1 from public.stores s where s.store_id = delivery_zones.store_id and s.owner_id = auth.uid())
     );
   ```
3. Every `create table`, `alter table add column`, `create policy`, and
   `create trigger` in this codebase uses `if not exists` / `drop ... if
   exists` first — **migrations must be idempotent**, safe to re-run. This
   isn't a style preference; the seed script and repeated dev-loop setup
   depend on it.
4. If the table needs Realtime, add it to the publication list at the end
   of a migration (see the pattern in `0001_init_schema.sql`'s section 8 —
   loop + swallow "already a member" errors).
5. Add the table + its columns to `frontend/src/types/database.types.ts`
   by hand (or regenerate properly via `supabase gen types typescript` if
   you have a live project migrated).

## Adding a new Edge Function

Follow the pattern in `supabase/functions/razorpay-verify-payment/index.ts`:

1. `mkdir supabase/functions/my-function && touch supabase/functions/my-function/index.ts`.
2. Use `Deno.env.get('SOME_SECRET')` for anything sensitive — never accept
   a secret as a request parameter.
3. If the function needs to bypass RLS (e.g. writing on a user's behalf
   after verifying something server-side), create the Supabase client with
   `SUPABASE_SERVICE_ROLE_KEY`, not the anon key. Every such write should
   be preceded by an explicit ownership check (`order.user_id ===
   userData.user.id`) — the service role bypassing RLS means *you* are now
   responsible for that check, Postgres won't do it for you.
4. Always validate the caller's JWT (`supabase.auth.getUser(jwt)`) before
   trusting `Authorization` header claims.
5. Return clear, typed JSON error bodies (`{ error: string }`) with
   correct HTTP status codes — the frontend's `payments.ts` pattern of
   catching `data?.error` and surfacing a clean message depends on this.
6. Deploy: `supabase functions deploy my-function`, then
   `supabase secrets set MY_SECRET=...` if needed.

## Extending the order status graph

If you need a new order status:

1. Add it to the Postgres enum: `alter type order_status add value if not
   exists 'my_new_status';` in a new migration.
2. Add it to the transition graph in **two places that must stay in sync**:
   - `enforce_order_status_transitions()` in SQL (the actual enforcement).
   - `isValidOrderTransition()` in `lib/orderStatus.ts` (client-side
     preview/UI-disabling — not enforcement, just UX).
   `lib/orderStatus.test.ts` exists specifically to catch these two
   drifting apart — run it after any change here.
3. Add the label/color to `ORDER_STATUS_LABELS`/`ORDER_STATUS_TONES` in the
   same file so every dashboard picks it up automatically (they all import
   from this single source rather than hardcoding their own maps).

## Running things locally

```bash
cd frontend
npm install
npm run dev         # start the app
npm run typecheck   # tsc -b, strict mode, .ts/.tsx only
npm run lint        # eslint, now correctly covers .js/.jsx/.ts/.tsx
npm run test         # vitest run — unit tests for business logic
npm run test:watch  # vitest, watch mode
npm run build        # production build
```

## Testing conventions

- **Unit test pure logic**, not components wired to Supabase — see
  `lib/__tests__/orderStatus.test.ts` and `lib/__tests__/cartMath.test.ts`
  for the pattern: extract the calculation/decision into a plain function,
  test that function directly. This is deliberately prioritized over
  mocking Supabase calls, which tends to produce brittle tests that
  encode implementation details rather than behavior.
- **Component tests** (`components/__tests__/UIStates.test.tsx`) are for
  genuinely presentational components with no external data dependency.
- There is currently no test harness for pages that call Supabase directly
  (most page components) — that would need a mocking strategy (MSW or a
  hand-rolled `supabase-js` mock) that hasn't been set up yet. A good
  next investment if the team grows.
