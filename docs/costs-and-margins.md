# Event Scout — Costs, Profit Margins & Guardrails

Plain-language money guide. Real costs come from our AI usage log
(last 7 days, ~50 real searches, as of 28 Sep 2026). Prices come from the live plan catalog.

> Short version: every action we sell brings in about **$1.28–$1.78**.
> It costs us about **37¢** on average. That's roughly **75% margin** on typical use.
> Safety limits stop any single search from costing more than **$2**.

---

## 1. What one action costs us (AI cost)

"Action" = one search or one contact reveal. Both cost the customer **20 credits**.

| Action | Average cost to us | Range seen | Worst case |
|---|---|---|---|
| Search (find opportunities) | **36¢** | 12¢ – 68¢ | **$2.00** hard stop |
| Contact reveal (organizers for one event) | **37¢** | 17¢ – 59¢ | no hard stop (see §6) |

- Searches that find nothing cost about the same as ones that do — the AI does the
  same research either way. Credits are still charged (the work was done).
- A failed search (error) is refunded to the customer, but the AI cost is still ours.

---

## 2. What customers pay per credit

| How they pay | Price | Credits | Per credit | Per action (20 credits) |
|---|---|---|---|---|
| Starter monthly | $79 | 1,000 | 7.9¢ | **$1.58** |
| Growth monthly | $199 | 2,500 | 7.96¢ | **$1.59** |
| Scale monthly | $499 | 6,500 | 7.68¢ | **$1.54** |
| Starter annual | $790/yr | 12,000/yr | 6.58¢ | **$1.32** |
| Growth annual | $1,990/yr | 30,000/yr | 6.63¢ | **$1.33** |
| Scale annual | $4,990/yr | 78,000/yr | 6.40¢ | **$1.28** ← cheapest |
| Top-up ($20–$2,000) | customer's choice | same as plans at $79 / $199 / $499 | 7.7¢–8¢ | **$1.54–$1.59** |

---

## 3. Profit per action

| | Starter monthly ($1.58) | Scale annual ($1.28, lowest) |
|---|---|---|
| Average search (36¢) | $1.22 profit · **77%** | $0.92 · **72%** |
| Expensive search (70¢) | $0.88 · **56%** | $0.58 · **45%** |
| Worst possible search ($2.00) | −$0.42 · **loss** | −$0.72 · **loss** |
| Average contact (37¢) | $1.21 · **77%** | $0.91 · **71%** |
| Expensive contact (59¢) | $0.99 · **63%** | $0.69 · **54%** |

A $2 search is rare — it's the safety stop for a runaway search, not normal cost.
The most expensive real search so far cost 68¢.

---

## 4. Profit per customer per month

Assumes the customer uses **every** credit at average cost (~37¢ per action).
Most customers use less, so real margins are higher.

| Plan | Pays | Actions | AI cost | Profit | Margin |
|---|---|---|---|---|---|
| Starter | $79 | 50 | ~$18 | ~$61 | **~77%** |
| Growth | $199 | 125 | ~$46 | ~$153 | **~77%** |
| Scale | $499 | 325 | ~$119 | ~$380 | **~76%** |

Heavy-cost month (every action at 70¢): Starter ~$35 cost → **~56%** margin.

Not included above:
- **Stripe fees** — about 2.9% + 30¢ per payment (≈ $2.59 on $79).
- **Fixed costs** — Vercel, Supabase, Resend (email). These don't grow per search.

### Rollover effect
Unused credits carry over, capped at **2× the monthly amount**. So a Starter customer
could, at most, spend 2,000 credits (100 actions, ~$37 AI cost) in a single month.
That month is still profitable, and it only happens after a quiet month.

---

## 5. Free trial cost

Trial = 1 search + 2 contact reveals (60 credits, worth $4.74 at Starter prices).

| Case | Cost to us |
|---|---|
| Unused trial | $0 |
| Search only | ~36¢ |
| Fully used, average | **~$1.10** |
| Fully used, expensive | ~$1.86 |
| Absolute worst ($2 search + 2 expensive contacts) | ~$3.18 |

One Starter signup ($79) pays for roughly **70 fully-used trials**.
Trials expire after **7 days**, so unused ones never come back to cost us later.

---

## 6. Guardrails (what protects our money)

### Before any money is spent
| Guardrail | What it does |
|---|---|
| **Pay first** | Credits are taken **before** the AI starts. No credits → no AI → $0 cost. |
| **Button lock** | "Plan required" when a customer can't afford a search. |
| **Server check** | Even if the button is bypassed, the server refuses without credits. |
| **Per-contact payment** | Each contact is paid for before lookup; if credits run out, the rest are skipped. |
| **Contact limit** | At most **10** automatic contact lookups per search, and never more than they can afford. |
| **Free trial limits** | 1 search + 2 contacts, one per email address, expires after 7 days. |

### During a search
| Guardrail | Setting | What it does |
|---|---|---|
| **Search cost ceiling** | **$2.00** per search | Before each AI step, we estimate its cost. If it would push the search over $2, that step is skipped. |
| Web searches per research pass | 4 (backup pass: 2) | Limits paid web lookups. |
| AI answer length | ~3,000 words (backup pass: ~1,600) | Stops endlessly long (expensive) answers. |
| Research text passed on | 48,000 characters | Stops huge inputs to the organizing step. |

The $2 ceiling is a **safety net** for bugs or runaway searches — not a margin
setting. Normal searches cost well under $1.

**Known gap:** contact reveals have no per-call dollar ceiling. They've cost at most
59¢ so far; they're watched after the fact by the flags below.

### After the fact (admin page flags)
| Flag | Triggers when | What to do |
|---|---|---|
| **Margin risk** | A customer's AI cost this month reaches **55%** of their plan price (i.e. our margin on them drops below 45%) | Look at their usage in **View**. Usually fine; act only if it keeps happening. |
| **Ceiling** | Customer hit "no credits" **3+ times in 24 hours** | Good moment to offer an upgrade or credit pack. |

### Billing safety
| Guardrail | What it does |
|---|---|
| **Test mode** | Stripe uses test keys (`sk_test`). No real money moves. |
| **Live checkout lock** | `STRIPE_ALLOW_LIVE_CHECKOUT=false` blocks live payments until launch is approved. |
| **No credits on failed payments** | A failed invoice never grants credits. |
| **Annual = monthly credits** | Annual customers get credits one month at a time, so no one can burn a year of credits in week one. |
| **Rollover cap** | Plan credits can't pile up beyond 2× the monthly amount. |
| **Owner usage tracked** | Your own searches are free but still recorded as cost, and kept out of customer metrics. |

---

## 7. Where to watch the numbers

- **Admin page → "AI spend this month"** — total AI cost this month.
- **Admin page → "Average action cost"** — should stay under the **$0.40 target**.
- **Admin page → Members table** — per-customer spend and flags.
- **Owner dashboard → "Profit vs AI spent"** — monthly revenue minus AI spend.

---

## 8. Quick answers

- **"Are we profitable per search?"** Yes — about 77% on average, even on the
  cheapest plan (~72%).
- **"Can one search bankrupt us?"** No — $2 hard stop per search.
- **"Can someone use it for free?"** Only the 7-day trial (~$1.10 average).
- **"What if costs go up?"** Watch "Average action cost" on the admin page. If it
  stays above $0.70, margins drop toward 50% and it's time to revisit prices or
  search depth.

For the detailed technical research behind these numbers, see
`docs/pricing-margin-research.md`.
