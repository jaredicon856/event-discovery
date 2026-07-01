# Event Scout

An AI-agent-powered database of speaking and networking opportunities. Two ways events get in:

1. **Manual/CSV seed** — the initial "Event List Example" spreadsheet.
2. **Agent discovery** — Claude, given a sector + search focus, searches the live web
   (`web_search` tool), researches candidate events/organizations, and normalizes what it
   finds into structured rows via a forced tool call. A second agent pass (`/api/enrich`)
   researches organizer/CFP contact info for a given event.

Stack: Next.js (App Router) on Vercel, Postgres on Supabase, Claude (Anthropic API) for
discovery/enrichment.

## Already provisioned

- Supabase project **event-scout** (org: Project I.C.O.N) — `yxejxwfhukfjrgkwhtil.supabase.co`
- Schema migration (`supabase/migrations/0001_init.sql`) already applied
- 62 events seeded from the example CSV
- `.env.local` is filled in with real Supabase keys. Only `ANTHROPIC_API_KEY` needs to stay current
  (get one at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)).

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll see the seeded events, a discovery panel to run new
agent searches, filters (sector/tier/status/date range/keyword), a "Find contact" button
per row, and a CSV export link.

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

Both routes accept an optional `x-cron-secret` header (checked against `CRON_SECRET` in env)
so they can be safely triggered from a scheduler — Vercel Cron, n8n, Zapier — once you decide
which categories to re-run on a cadence. Without `CRON_SECRET` set, they're open (fine for
local dev, not for production).

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the same env vars from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   and a real random `CRON_SECRET`) in Vercel's Project Settings → Environment Variables.
4. Deploy. The discovery/enrich routes have `maxDuration` set (300s/120s) since web-search
   agent calls take a while — make sure your Vercel plan supports that function duration
   (Pro plan or higher for >60s; Hobby caps at 60s, so bump `maxDuration` down or upgrade).

## What's not built yet (next steps)

- **Recurring re-crawl scheduling** — the `sources` table exists for tracking known portfolio
  organizations (Small Business Expo, Becker's, DigiMarCon, etc.) to re-check periodically, but
  nothing populates or schedules against it yet. Wire up Vercel Cron or n8n to call
  `/api/discover` on a cadence per sector once you've picked which sectors to track.
- **GoHighLevel export/sync** — CSV export exists (`/api/export?sector=...&tier=...&...`);
  pushing rows directly into a GHL pipeline/contact list as opportunities are found is not
  built.
- **Contact enrichment API fallback** — `/api/enrich` currently relies entirely on agent web
  search. For higher hit rates you could add Hunter.io/Apollo as a fallback when the agent
  finds an organization but no named contact.
- **Auth** — none. This is an open internal tool per the MVP scope. Add Supabase Auth if it
  needs to be multi-user or gated.
