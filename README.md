# Event Scout

An AI-agent-powered database of speaking and networking opportunities. Two ways events get in:

1. **Manual/CSV seed** — the initial "Event List Example" spreadsheet.
2. **Agent discovery** — Claude, given a sector + search focus, searches the live web
   (`web_search` tool), researches candidate events/organizations, and normalizes what it
   finds into structured rows via a forced tool call. A second agent pass (`/api/enrich`)
   researches organizer/CFP contact info for a given event.

Stack: Next.js (App Router) on Vercel, Postgres on Supabase, Claude (Anthropic API) for
discovery/enrichment.

## App shell / navigation

A persistent sidebar (`src/components/Sidebar.tsx`, dark/gold, in `layout.tsx`) replaces the old
single-page layout. Pages:

- **Overview** (`/`) — customer credits/activity, or a separate owner operations overview.
- **Opportunities** (`/opportunities`) — guided search, in-progress stages, verified results, and previous searches. `/discover` redirects here.
- **Saved Lists** (`/lists`) — private filter presets/search batches; deleting one removes only the shortcut.
- **Usage & Credits** (`/usage`) — customer-visible grants, charges, and refunds.
- **Billing** (`/billing`) — live credit balance, Stripe Checkout/portal, plans, and ledger history.
- **Profile & Settings** (`/settings/profile`) — editable personal profile, private photo, and timezone.
- **Account & Security** (`/settings/security`) — actual connected methods, passwords, and sessions.
- **Administration** (`/admin`) — role-gated members, invitations, balances, audits, and internal costs.

## Launch pricing and credit model

| Plan | Monthly price | Credits | AI actions | Typical 7-event runs |
| --- | ---: | ---: | ---: | ---: |
| Starter | $79 | 1,000 | 50 | about 6 |
| Growth | $199 | 2,500 | 125 | about 15 |
| Scale | $499 | 6,500 | 325 | about 40 |

One discovery costs **20 credits**. Each event contact enrichment costs another **20 credits**.
A typical search that finds and auto-enriches seven events therefore costs 160 credits.

The allocations are modeled against a $0.40 target direct-AI cost per action, based on Sonnet 5
at $2/input MTok and $10/output MTok plus $0.01 per web search. This is a target, not a hard
provider guarantee: live evaluation observed $0.20–$0.48 discovery cost, and the application
records and flags overruns. Monthly
credits roll over while subscribed, capped at 2x the plan allowance. Failed AI actions are
automatically refunded.

The detailed model is in the Event Scout pricing canvas in this Cursor workspace.

The white "content panel" look isn't per-component styling — every component already used
semantic tokens (`bg-icon-background`, `text-icon-text`, etc. — see `globals.css`) instead of
hardcoded colors, so the light theme is one CSS scope (`.theme-panel`, wrapping `<main>` in
`layout.tsx`) that re-points those same tokens to light values. The sidebar keeps the original
dark values. No component needed to change for the light/dark split itself — only a few
hardcoded status/tier/confidence badge colors (tuned for the old all-dark background) needed
fixing separately for contrast on white.

## Already provisioned

- Supabase project **event-scout** (org: Project I.C.O.N) — `yxejxwfhukfjrgkwhtil.supabase.co`
- Schema migration (`supabase/migrations/0001_init.sql`) already applied
- 62 events seeded from the example CSV
- `.env.local` needs Supabase, Anthropic, and Stripe values from `.env.example`. Create/update the
  Anthropic key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

## Developing in the cloud (GitHub Codespaces) — no local checkout needed

This repo includes `.devcontainer/devcontainer.json`, so you can develop entirely in the cloud
instead of cloning it to your own machine:

1. On [github.com/jaredicon856/event-discovery](https://github.com/jaredicon856/event-discovery),
   click **Code → Codespaces → Create codespace on main**. GitHub spins up a cloud VM with Node
   pre-installed and runs `npm install` automatically.
2. Add the real secrets once as **Codespaces secrets**, not in any committed file: repo
   **Settings → Secrets and variables → Codespaces**, add each of `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   `CRON_SECRET`, `BC_INGEST_SECRET`, `IRIS_INGEST_URL`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_*` values (see `.env.example`;
   get the real values the same place you got them for `.env.local`/Vercel). They're injected
   automatically into every future Codespace for this repo.
3. In the Codespace's terminal (a full VS Code in your browser, or reopen it in your local VS
   Code / JetBrains "Remote - Codespaces" — the *code* still runs in the cloud VM either way):
   `npm run dev` to preview, or `claude` to start a Claude Code session — every file it edits
   lives on that cloud VM, never on your own machine.
4. Push commits from there as usual; Vercel redeploys the same way regardless of where the push
   came from.

Codespaces usage is billed by GitHub past the free monthly quota — stop the Codespace
(**Codespaces → ⋯ → Stop codespace**) when you're done with it for the day.

## Local development (alternative — runs on your own machine)

```bash
nvm use
npm install
npm run dev -- --webpack
```

Node 22 is the supported local/build runtime (`.nvmrc`). Open http://localhost:3000.

## Re-running the schema or reseeding

If you ever need a fresh Supabase project:

1. Create a project at supabase.com, copy `Project URL`, publishable key, and secret key into
   `.env.local` (see `.env.example` for the variable names — the app accepts either the new
   `sb_publishable_...`/`sb_secret_...` keys or legacy `anon`/`service_role` keys).
2. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or via `supabase db push`
   if you set up the CLI).
3. `npm run seed` — imports `scripts/seed-events.csv` (the original example list) into `events`.

## How discovery works

`POST /api/discover` with `{ "sector": "...", "query": "..." }`:

1. `researchCategory()` — Claude with the `web_search` tool searches the web for real,
   currently-scheduled opportunities matching the sector/query and returns a findings brief
   with URLs.
2. `extractEvents()` — a second Claude call, forced to call a `submit_events` tool with a
   strict JSON schema, converts the findings into rows matching the `events` table.
3. Rows are upserted into Supabase (`onConflict: event_name,event_start,source_url`).

`POST /api/enrich` with `{ "eventId": "..." }` does the same two-step pattern (research, then
forced structured extraction) to find organizer names/emails/phones for a specific event.
`/api/discover` now also auto-runs this enrichment for every event it saves, so contacts show up
without a separate manual step.

Both routes require an active, non-suspended authenticated user. Active super-admins use an
explicit `owner_unbilled` entitlement: operations remain owned, idempotent, and fully metered
for AI cost, while customer credits and trial counters stay untouched. Discovery and contact
ownership are checked server-side; they are not callable anonymously or with a cron secret.

## Scheduled (cron) discovery

Check "Repeat this search daily" when running a discovery from the dashboard to save it as a row
in `discovery_schedules`. A Vercel Cron job (configured in `vercel.json`, currently daily at
13:00 UTC) hits `GET /api/cron/run-scheduled`, which re-runs every *enabled* schedule end-to-end
(search → extract → save → auto-enrich contacts) and records `last_run_at`/`last_run_summary` on
each row. Toggle a schedule on/off or delete it from the "Scheduled searches" panel on the
dashboard — no redeploy needed to change which searches run.

To change the frequency, edit the `schedule` cron expression in `vercel.json` and redeploy (cron
schedules are read from that file at build time, not from the database). Note: Vercel's Hobby
plan limits cron jobs to once per day; more frequent schedules require Pro.

This route authenticates differently than the others — Vercel automatically sends
`Authorization: Bearer <CRON_SECRET>` on cron-triggered requests (its own convention, separate
from the `x-cron-secret` header used elsewhere), so `CRON_SECRET` **must** be set in Vercel for
the cron job to run at all.

## Durable discovery worker

Discovery requests atomically create the run, debit or record the entitlement operation, and
enqueue `discovery_jobs`. The immediate `after()` path and recovery worker both claim the same
90-second database lease; a 30-second heartbeat keeps a live job from being reclaimed. Queued
jobs and expired leases are retried at most three times. Terminal technical failures restore
customer discovery credits when applicable. Completed stage artifacts are reused after recovery,
although a process crash after a provider response but before artifact persistence can still
repeat provider cost.

- **Vercel:** `/api/cron/process-discovery` runs every minute. This requires Vercel Pro or
  Enterprise because Hobby cron is limited to once daily. Set `CRON_SECRET`; Fluid Compute's
  300-second default must remain available to the route.
- **Local:** Vercel cron does not run under `next dev`. Run `npm run worker:discovery` in a
  second terminal. It polls every five seconds by default; override with
  `DISCOVERY_WORKER_POLL_MS`.

## Saved lists ("smart lists")

Apply any combination of filters (sector/tier/status/date range/keyword) on the dashboard, then
click "Save as list" to bookmark that exact filter as a named, one-click shortcut — stored in
`saved_lists`. Clicking a saved list's name re-applies its filters instantly.

A saved list can also capture the results of one specific discovery run (see below) instead of a
sector/tier/etc filter — that's what "Save as list" does when you save from the default "latest
search results" view, where there's no filter to save otherwise.

Deleting a saved list removes only that customer-owned shortcut. Shared internal event/cache
records and other customers’ activity are never deleted or exposed by this action.

## Default dashboard view: latest search results, not everything

Every result is linked through a customer-owned `discovery_run_id`. A completed search navigates
to `/opportunities?runId=<id>`, where the server verifies that the run belongs to the signed-in
profile before loading any shared cache records. The page summarizes events, contacts, partial
failures, and customer credits or unbilled owner usage.

Applying any filter, opening a saved list, or clicking "Browse all events instead" bypasses the
"latest run" restriction and queries across every event as before. The CSV seed data and any
event whose run has since been superseded still exist and are fully reachable this way — nothing
is hidden permanently, just not shown by default.

## Iris export (PDF → Command Center)

"Export PDF" opens a modal (client email required, name optional), generates a PDF of whatever's
currently shown (same filters as "Export filtered CSV"), and:

1. POSTs it server-side to Iris (`POST /api/ingest/client-documents` on the sales app) with
   `type: "event_scout_pdf"`, authenticated via `Authorization: Bearer ${BC_INGEST_SECRET}` —
   `BC_INGEST_SECRET` is server-only (`src/lib/iris.ts` / `src/app/api/export/pdf/route.ts`) and
   never reaches the browser.
2. Triggers a normal local download of the same PDF in the browser regardless of the Iris
   outcome, so the export is still useful even if the client isn't in Iris yet or the request
   fails.

Iris matches purely on email against existing `ops_clients` and **never creates a new client** —
`{ attached: false, reason: "no_matching_client" }` surfaces as a toast telling the user to fix
the email or add the client in Ops/Iris first. `{ attached: true }` shows a success toast with
the client name Iris returned. Re-exporting the same document `type` for a client replaces the
previous file on their Documents tab (that's Iris-side behavior, not something this app controls).

Requires `BC_INGEST_SECRET` (same value used by Command Center / Battlecard Generator) and
optionally `IRIS_INGEST_URL` (defaults to the production sales-app URL) in env.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the same env vars from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   `CRON_SECRET`, `BC_INGEST_SECRET`, and all Stripe values in `.env.example`) in Vercel's
   Project Settings → Environment Variables. Configure Stripe to send subscription webhooks to
   `/api/stripe/webhook`.
   Keep `STRIPE_CHECKOUT_ENABLED=false` and `STRIPE_ALLOW_LIVE_CHECKOUT=false` until the
   test-mode acceptance matrix has passed.
4. Deploy. The discovery/enrich routes have `maxDuration` set (300s/120s) since web-search
   agent calls take a while — make sure your Vercel plan supports that function duration
   (Pro plan or higher for >60s; Hobby caps at 60s, so bump `maxDuration` down or upgrade).

## Authentication, Google, and owner setup

Public users may register with a verified email/password identity or Google and receive one
idempotent trial: one discovery plus contact research for up to two returned events. Invitations
remain optional. The initial owner uses `admin@projecticon.io`; the email alone never grants
privileges.

1. Set `NEXT_PUBLIC_APP_URL` to the exact app origin and add
   `${NEXT_PUBLIC_APP_URL}/auth/callback` to Supabase Authentication → URL Configuration.
2. Run `npm run owner:bootstrap -- invite`, then accept the email while that app origin is
   reachable.
3. Run `npm run owner:bootstrap -- promote`. The database refuses promotion unless the auth
   identity is verified, its one-time invitation was accepted, and no active super-admin exists.
4. In Google Cloud, create an OAuth 2.0 **Web application** client. Add authorized JavaScript
   origins `http://localhost:3000` and the exact production origin. Add the authorized redirect
   URI `https://yxejxwfhukfjrgkwhtil.supabase.co/auth/v1/callback`.
5. In Supabase Authentication → Providers → Google, enable Google and paste that client ID and
   secret. In Authentication → URL Configuration set the production origin as Site URL and add
   these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<production-domain>/auth/callback`
6. Test new Google signup, returning Google sign-in, and same-verified-email linking. Each case
   must resolve to one profile and one trial claim.
7. Enable Supabase leaked-password protection before launch.

Google is enabled in Supabase and the app reaches Google's account chooser with the configured
client and Supabase callback. Complete one manual account-consent pass for each case in step 6;
the agent cannot enter or approve personal Google credentials. Supabase automatic linking must
only link identities with the same verified email.

## Stripe test setup

1. In Stripe **test mode**, create three monthly recurring prices: $79, $199, and $499.
2. Set `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`,
   `STRIPE_PRICE_SCALE`, and `STRIPE_WEBHOOK_SECRET=whsec_...`.
3. Send test webhooks to `<app-origin>/api/stripe/webhook` for `checkout.session.completed`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and
   `customer.subscription.deleted`. For local testing, use Stripe CLI forwarding.
4. For local test Checkout, set `STRIPE_CHECKOUT_ENABLED=true` only with `sk_test_...` and test
   Price objects. Keep `STRIPE_ALLOW_LIVE_CHECKOUT=false`. The route rejects live keys, live
   Prices, and mismatched currency, amount, or interval. Keep production Checkout disabled until
   the test-mode lifecycle matrix passes; never enable the live flag before launch approval.
5. Verify paid signup, paid upgrade, next-renewal downgrade, renewal, failed renewal,
   cancellation, portal return, and duplicate webhook delivery. Ledger grants must remain
   invoice/event-idempotent.
   The complete sandbox matrix passed on 23 September 2026; evidence is in
   `docs/stripe-test-lifecycle-2026-09-23.md` and can be repeated with `npm run test:stripe`.

## Credit and cancellation rules

- Subscription and rollover credits remain usable during an active paid period, capped together
  at 2× the monthly allowance. Manual credits are a separate, persistent bucket and do not count
  toward that cap.
- A scheduled cancellation sets the subscription/rollover expiry to the paid-through date.
  Manual credits do not expire. Debit checks enforce the paid-through date even if a webhook is
  late, and refunds retain the original bucket/expiry.
- Failed invoices never grant credits. Paid renewals and upgrades are invoice-idempotent.
  Downgrade allowance changes take effect on the next successfully paid cycle.
- Discovery costs 20 credits; each requested contact lookup costs another 20. Customers choose
  the automatic contact lookup cap before a run.

## What's not built yet (next steps)

- **Portfolio-organization tracking** — the `sources` table exists for treating companies whose
  business model is running recurring speaker events (Small Business Expo, BookThinkers, Top
  Talent Hollywood) as permanent watch-targets distinct from one-off conferences, but nothing
  populates it or crawls it specially yet. Scheduled discovery (above) covers *sector-level*
  recurrence; it doesn't yet have a *source-level* re-crawl of a specific known organization's site.
- **GoHighLevel export/sync** — CSV export exists (`/api/export?sector=...&tier=...&...`);
  pushing rows directly into a GHL pipeline/contact list as opportunities are found is not
  built.
- **Contact enrichment API fallback** — `/api/enrich` currently relies entirely on agent web
  search. For higher hit rates you could add Hunter.io/Apollo as a fallback when the agent
  finds an organization but no named contact.
- **Annual plans** — available once `STRIPE_PRICE_*_ANNUAL` Price IDs are set (10× monthly,
  ~16.7% off). **Credits still grant monthly** on annual billing so a customer cannot burn a
  year of capacity in week one; `/api/cron/grant-annual-credits` issues months 2–12. One-time
  credit top-ups let customers choose any whole-dollar amount from $20 to $2,000 (priced in
  `src/lib/topup.ts`) and appear once the customer has a live plan.
