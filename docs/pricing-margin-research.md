# Event Scout — Pricing & Margin Research

Deep-research pass on cost structure, gross margin, and guardrails for the credit-based
launch pricing (`$79` Starter / `$199` Growth / `$499` Scale). Written to disk so it
persists outside chat/Cursor-canvas history. Source numbers reconcile with the assumptions
already encoded in `src/lib/stripe.ts`, `src/lib/credits.ts`, `tests/pricing.test.ts`, and
the "Launch pricing and credit model" section of `README.md`.

## 1. Unit economics per billable action

*Note on two different numbers in this doc (flagged in review, 24 Sep 2026): the $0.40
figure below is a planning assumption for AVERAGE realized cost per action, used only for
margin math (Sections 1-3). `TARGET_DISCOVERY_USD` in Section 7 ($2.00) is a per-search
CEILING — a runaway-cost safety net for the worst individual case, not the expected cost.
A search costing close to $2.00 would be a rare outlier, not the norm the margin model is
built on; the $0.40 average-cost assumption is unaffected by the ceiling being much higher.*

Every discovery run and every contact enrichment costs the customer **20 credits** (one
"AI action"). Direct cost to us per action:

| Cost component | Assumption | $/action |
| --- | --- | --- |
| Claude Sonnet 5 tokens | ~4–8k input / ~1–2k output tokens typical | $0.02–0.03 |
| `web_search` tool calls | ~3–6 calls @ $0.01 each | $0.03–0.06 |
| **Modeled target** | conservative planning number | **$0.40** |
| **Observed in six-run live eval** | measured discovery runs during testing | **$0.199–$0.478** |

We plan against the conservative $0.40 figure so real-world variance (harder sectors,
retries, longer research chains) doesn't erode margin. The six-run evaluation measured
**$1.606566 total / $0.267761 average per discovery**. This is a small pre-launch sample,
not a production forecast. The run IDs, queries, outcomes, and telemetry reconciliation
are recorded in [the 22 September evaluation report](./search-evaluation-2026-09-22.md).

## 2. Non-AI cost per customer

| Cost | Notes | Monthly estimate |
| --- | --- | --- |
| Stripe fees | 3.6% + $0.30 per charge (blended card mix incl. international) | plan price × 3.6% + $0.30 |
| Supabase + Vercel infra | shared/serverless, allocated per active paying seat at modest scale (<500 customers) | ~$2–6/customer, scales with plan tier (heavier plans = more DB rows, exports, cron) |
| Support/ops overhead | not modeled here — assume covered by the gross-margin buffer, not COGS | — |

## 3. Margin by plan

Gross margin = (plan price − AI cost − Stripe fee − infra allocation) / plan price.

| Plan | Price | Credits | Actions | AI cost @ $0.40 | AI cost @ $0.267761 measured avg | Stripe fee | Infra alloc | Margin @ $0.40 | Margin @ measured avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | $79 | 1,000 | 50 | $20.00 | $13.39 | $3.14 | $2.50 | **67.54%** | **75.91%** |
| Growth | $199 | 2,500 | 125 | $50.00 | $33.47 | $7.46 | $4.00 | **69.11%** | **77.42%** |
| Scale | $499 | 6,500 | 325 | $130.00 | $87.02 | $18.26 | $6.00 | **69.09%** | **77.70%** |

**Verdict: all three plans fall below the 70% floor when AI cost reaches the $0.40
planning target and the stated infrastructure allocation is included.** The measured
six-run sample produces stronger margins, but it is too small to justify a launch-margin
claim. Pricing or allowances should be revisited if production costs approach the target.

## 4. Guardrails already implemented in code

These exist today and directly protect the margin model:

- **Ledger-based credits, never a mutated counter** (`src/lib/credits.ts`) — balance is
  always `sum(credit_ledger)`, eliminating drift/double-spend as an abuse vector.
- **Atomic debit-before-work** via the `debit_credits_v2` RPC — credits are reserved before
  an AI call runs, not after, so a customer can never run more actions than they've paid for.
- **Automatic refunds on failed actions** (`refundUsageCredits` /
  `complete_credit_operation`) — customers aren't charged for our infra/API failures, but we
  also don't double-refund on retries (idempotent via `operationKey`).
- **Rollover cap at 2× monthly allowance** — prevents unbounded credit accumulation from
  inflating a single customer's effective discount below plan price over time.
- **Manual credits are a separate, non-expiring bucket** — admin goodwill/refund credits
  never silently extend a churned customer's paid-plan cost basis.
- **Cost telemetry + margin monitoring in the admin dashboard** (`0023_admin_dashboard_metrics.sql`,
  `AdminConsole.tsx`) — tracks AI spend vs. the $0.40 target per action so a real cost
  regression (model price change, more expensive searches) is visible before it erodes
  margin at scale.
- **Stripe Checkout is hard-locked to test mode** (`assertStripeSecretIsTestMode`,
  `assertLocalTestCheckoutEnabled` in `src/lib/stripeCheckout.ts`) until the full
  paid-signup/upgrade/downgrade/renewal/cancellation/duplicate-webhook matrix is verified —
  prevents shipping a billing bug that grants credits without payment, or vice versa.
- **Invoice/event-idempotent webhook handling** (`stripe_webhook_events` unique-insert claim
  in `src/app/api/stripe/webhook/route.ts`) — a retried Stripe webhook can't grant credits twice.
- **`tests/pricing.test.ts`** reconciles the documented stress-case margins including
  infrastructure allocation, preventing the broader margin claim from drifting away from
  its own assumptions.

## 5. Guardrails added this pass

- **Credit top-up packs are priced at or above the Starter plan's effective $/credit**
  (~$0.079/credit), with a small convenience premium, so an à la carte top-up can never be
  cheaper per-credit than committing to a subscription — protects margin on the highest-cost
  (spiky, no recurring commitment) usage pattern. See `src/lib/stripe.ts` top-up pack config.
- **Per-tool kill switch** (`feature_flags` table + `isToolEnabled()`) lets us disable the
  most AI-cost-intensive actions (discovery, enrichment) instantly and globally if a cost
  spike or provider incident threatens margin, without a deploy.
- **Impersonation is audit-logged and time-boxed** (30 min signed cookie, `admin_audit_log`
  rows on start/stop) — support/debug access to a paying customer's account is fully
  traceable, which matters for any future SOC2/compliance conversation as ARR grows.

## 6. Remaining risks / recommendations

1. **Stress margin below target (67.54–69.11%)** — if actual AI cost trends toward
   the $0.40 target rather than the small measured sample, all three plans fall below
   the 70% floor. Recommend re-pricing or re-allocating credits-per-action (e.g. 22–24
   credits/action) if the admin dashboard's rolling average AI cost exceeds ~$0.38/action
   for two consecutive weeks.
2. **Infra allocation is a rough estimate**, not measured per-customer. Once real Supabase/
   Vercel invoices exist at meaningful customer volume, replace the $2–6 placeholder with
   actual usage-based allocation.
3. **No abuse/rate-limit ceiling per customer per day** beyond credit balance itself — a
   single customer burning their entire monthly allowance in one hour is still "paid for"
   but could create AI-provider rate-limit contention for other customers. Consider a soft
   per-hour action cap independent of credit balance if this becomes an issue.
4. **Annual plans and volume discounts are intentionally deferred** (per README) until
   there's enough real usage telemetry to discount safely without breaking the margin floor.
5. **Re-run this analysis after the first 100 completed production runs** with real
   Anthropic invoice data — the $0.267761 measured average comes from six pre-launch
   evaluation runs, not production scale.

## 7. Product decision: per-search cost ceiling is a safety net, not a margin lever (24 Sep 2026)

`TARGET_DISCOVERY_USD` in `src/lib/providerBudget.ts` was raised from $0.55 to **$2.00**.
This is a deliberate reframing, not just a bigger number:

- Credits are the real monetization lever, not our internal per-search dollar spend. A
  customer already commits a fixed number of credits per discovery action regardless of
  how much research it actually takes to do a good job; a customer who wants more
  thoroughness runs more searches, which is more credits and more revenue for us.
- A live evaluation (24 Sep 2026) showed the previous, tighter ceiling actively hurting
  result quality: a broad multi-sector/multi-type search stopped researching (never even
  reached podcasts, which the query asked for) purely to protect a ~$0.40-0.55 per-search
  dollar ceiling, producing a worse result for the same 20-credit charge.
- This ceiling's only remaining job is to catch a genuinely pathological run (a bug, a
  retry loop) before it spends an unbounded amount — not to bound normal deep or broad
  research. It should not be tuned down again to chase the margin numbers in Section 3;
  margin is managed at the plan/credit-pricing level (Sections 1-3), not by truncating
  individual searches.
- When a run does still hit this (now much rarer) ceiling, the customer sees a plain-
  language message (`src/app/(app)/opportunities/page.tsx`) explaining the search needed
  unusually deep research, that credits were refunded, and suggesting a narrower search —
  not a raw technical error string.

### 7a. Contact enrichment has no cost ceiling at all (found in review, 24 Sep 2026)

Unlike discovery, a contact lookup (`findEventContacts` in `src/lib/agent.ts`) has **no
pre-call affordability check whatsoever** — up to 10 web searches plus two model calls per
contact, and up to 10 contacts can be requested per search. A single real contact lookup
was observed costing $0.59. This sits entirely outside `TARGET_DISCOVERY_USD`.

Also found and fixed in the same review: `discovery_runs.estimated_cost_usd` never
included enrichment spend at all — it was recorded in `ai_usage` (global telemetry) but
never rolled into the per-run field, so a run's own tracked cost undercounted real spend
by however much its contacts cost (observed: $0.17 tracked vs $0.76 real on one run). Fixed
via an atomic `increment_discovery_run_cost` RPC (`enrichment.ts`, migration 0031) — the
run's cost field is now accurate for per-run UI and any report that reads that column.

Deliberately **not** adding a synthetic pre-call budget check for contacts: the discovery
ceiling's own pre-call estimate already proved unreliable at predicting real cost (that's
the whole reason `RESEARCH_PROMPT_OVERHEAD_CHARS` exists — see Section on
`estimateCallUsd`), and a contact lookup's call shape is fixed regardless of the estimate,
so a static pre-check would not have caught the $0.59 case either.

Safety net for contacts is after-the-fact, and it was already live before the rollup fix:
per-customer margin-risk flags (`src/lib/adminSpend.ts` → `adminSpendFlags.ts`) sum
`ai_usage.estimated_cost_usd`, which already included enrichment. The rollup did **not**
fix those flags — they were never undercounting. It fixed the separate bug where
`discovery_runs.estimated_cost_usd` (run detail / run-level displays) omitted contacts.
Revisit a harder contact spend cap only if margin-risk flags prove insufficient once
there's real contact-lookup cost data at volume.
