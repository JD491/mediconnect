# Deployment

## Pre-deployment checklist

- [ ] Run all 12 migrations, in order, against your production Supabase
      project (see README Quick Start for the exact list; `0012` must be last).
- [ ] Run `supabase/seed/seed_catalog.sql` (medicines + emergency contacts —
      no auth dependency, safe for production as starter data, or skip if
      you have real catalog data to import instead).
- [ ] **Turn "Confirm email" back ON** in Authentication → Providers → Email
      before going live — it's turned off in the Quick Start purely for
      local demo convenience. With it on, move store/doctor row creation
      into a `handle_new_user`-style trigger or Edge Function (see the
      README's "Known Supabase setting" section) so self-service signup
      still works correctly.
- [ ] Deploy all three Edge Functions:
      ```bash
      supabase functions deploy razorpay-create-order
      supabase functions deploy razorpay-verify-payment
      supabase functions deploy gemini-health
      ```
      The two Razorpay functions are required for online payments; without
      them the app falls back to the interactive demo gateway and never takes
      real money. `gemini-health` is optional but recommended — without its
      secret the app transparently uses its local deterministic AI engine.
- [ ] Set **production** Razorpay keys (not test/sandbox) as Supabase
      secrets: `supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...`.
      Never put these in frontend `.env` — see `SECURITY.md`.
- [ ] Optionally set the Gemini secret to enable model-backed triage, chat and
      prescription OCR: `supabase secrets set GEMINI_API_KEY=...`
      (add `GEMINI_MODEL=gemini-flash-lite-latest` only if you want a non-default model;
      lite is the default because full flash models can be capacity-limited).
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
GEMINI_API_KEY=<your Gemini API key>        # optional
GEMINI_MODEL=gemini-flash-lite-latest     # optional, this is the default
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided to Edge
Functions by Supabase — you don't set these yourself.

The frontend needs no payment/AI env vars: the Razorpay public Key ID is
returned by `razorpay-create-order` and the AI functions are called through
the Supabase client, so both secrets stay server-side.

**Never set** any `RAZORPAY_KEY_SECRET`, `GEMINI_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, or similar in the frontend build — anything
prefixed `VITE_` is bundled into the public JavaScript and readable by anyone.

## Build & hosting

The frontend is a static SPA (`npm run build` → `frontend/dist/`) —
deployable to any static host (Vercel, Netlify, Cloudflare Pages, S3+CDN).
Configure your host for SPA fallback routing (all paths → `index.html`),
since this uses client-side routing (`react-router-dom`). Both
`vercel.json` files already do this; existing static files such as
`/sw.js`, `/manifest.webmanifest` and `/offline.html` are still served
directly because static files take precedence over the rewrite.

**PWA assets** ship in `frontend/public/`:
- `manifest.webmanifest` — installable app metadata (name, theme, icons).
- `sw.js` — runtime cache. Serve it from the site root with a short cache
  lifetime (`Cache-Control: no-cache, max-age=0`) so updates are picked up;
  the app registers it only in production builds.
- `offline.html` — navigation fallback when the network is down.
- `brand/favicon-192.png`, `favicon-384.png`, `favicon-512.png`, `favicon.svg`.

Do not rewrite `/sw.js` or serve it with a long `max-age`; a stale worker
can pin users to an old bundle. Both `vercel.json` files already set
`Cache-Control: public, max-age=0, must-revalidate` for `/sw.js` and
`/manifest.webmanifest`. If you deploy to a different host, add an equivalent
rule there.

## Post-deployment smoke test

Sign in as one account per role and confirm:
- **Customer**: browse → add to cart → checkout (both COD and, if Razorpay
  is live, a real online payment) → see the order in tracking.
- **Store Owner**: see the new order, advance its status, confirm the
  customer's notification bell updates in near-real-time.
- **Admin**: Audit Logs shows the order/status events that just happened.

Also verify the PWA/SEO surface in a production build (the service worker
registers only in production, so this cannot be checked with `npm run dev`):
- `/manifest.webmanifest` returns 200 with `application/manifest+json` and
  contains `start_url`, `display: standalone` and the 192/384/512 icons.
- `/brand/favicon-192.png` and `/brand/favicon-384.png` return 200.
- `/sw.js` returns 200 and DevTools → Application → Service Workers shows an
  active worker controlling the page.
- `/offline.html` returns 200; going offline and reloading a route shows the
  offline page instead of the browser error.
- `/robots.txt` returns 200 and disallows the authenticated `/app/*` paths.
- A deep link such as `/app/store` loads directly (SPA rewrite is working).

If any of these silently fail, check the Supabase dashboard's API logs and
Edge Function logs first — most failures at this stage are RLS policy
mismatches or a missing/misspelled secret. For online payments and AI
features, confirm `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` and (optionally)
`GEMINI_API_KEY` are set on the deployed functions.

## Rollback

Migrations in this project are additive (no migration drops a previous
migration's objects) but are **not currently paired with down-migrations**.
If a migration causes a production issue, the safe path is a new
forward-fixing migration, not attempting to hand-write a revert — Postgres
enum changes in particular (`ALTER TYPE ... ADD VALUE`) cannot be cleanly
undone within a transaction.
