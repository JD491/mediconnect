# Deployment

## Pre-deployment checklist

- [ ] Run all 11 migrations, in order, against your production Supabase
      project (see README Quick Start for the exact list).
- [ ] Run `supabase/seed/seed_catalog.sql` (medicines + emergency contacts —
      no auth dependency, safe for production as starter data, or skip if
      you have real catalog data to import instead).
- [ ] **Turn "Confirm email" back ON** in Authentication → Providers → Email
      before going live — it's turned off in the Quick Start purely for
      local demo convenience. With it on, move store/doctor row creation
      into a `handle_new_user`-style trigger or Edge Function (see the
      README's "Known Supabase setting" section) so self-service signup
      still works correctly.
- [ ] Deploy both Edge Functions: `supabase functions deploy
      razorpay-create-order` and `razorpay-verify-payment`.
- [ ] Set **production** Razorpay keys (not test/sandbox) as Supabase
      secrets: `supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...`.
      Never put these in frontend `.env` — see `SECURITY.md`.
- [ ] Set frontend env vars for your production build (see below).
- [ ] Confirm Realtime replication is enabled for the tables listed in
      `docs/ARCHITECTURE.md` (Database → Replication in the Supabase
      dashboard) — migrations attempt this automatically but double-check.
- [ ] Run `npm run typecheck && npm run lint && npm run test && npm run build`
      one final time against the exact commit you're deploying.
- [ ] Manually exercise the full testing checklist below against the
      production project (not just local/staging) before announcing launch.
- [ ] Set up Supabase project backups / point-in-time recovery if your plan
      supports it — there is no application-level backup mechanism here.

## Environment variables

**Frontend** (`frontend/.env`, or your hosting provider's env var UI):
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/public key>
```
Both are safe to expose publicly (that's what "anon key" means) — RLS is
what actually protects data, not secrecy of this key.

**Supabase Edge Function secrets** (`supabase secrets set ...`, never in
frontend env):
```
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<your live secret>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided to Edge
Functions by Supabase — you don't set these yourself.

**Never set** any `RAZORPAY_KEY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or
similar in the frontend build — anything prefixed `VITE_` is bundled into
the public JavaScript and readable by anyone.

## Build & hosting

The frontend is a static SPA (`npm run build` → `frontend/dist/`) —
deployable to any static host (Vercel, Netlify, Cloudflare Pages, S3+CDN).
Configure your host for SPA fallback routing (all paths → `index.html`),
since this uses client-side routing (`react-router-dom`).

## Post-deployment smoke test

Sign in as one account per role and confirm:
- **Customer**: browse → add to cart → checkout (both COD and, if Razorpay
  is live, a real online payment) → see the order in tracking.
- **Store Owner**: see the new order, advance its status, confirm the
  customer's notification bell updates in near-real-time.
- **Admin**: Audit Logs shows the order/status events that just happened.

If any of these silently fail, check the Supabase dashboard's API logs and
Edge Function logs first — most failures at this stage are RLS policy
mismatches or a missing/misspelled secret.

## Rollback

Migrations in this project are additive (no migration drops a previous
migration's objects) but are **not currently paired with down-migrations**.
If a migration causes a production issue, the safe path is a new
forward-fixing migration, not attempting to hand-write a revert — Postgres
enum changes in particular (`ALTER TYPE ... ADD VALUE`) cannot be cleanly
undone within a transaction.
