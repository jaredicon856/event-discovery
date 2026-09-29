# Event Scout — Owner Guide

Plain-language guide to credits, plans, trials, and the admin page.
Everything here matches how the live app behaves today.

---

## 1. Credits in one minute

Credits are what customers spend to use Event Scout.

| Action | Cost |
|---|---|
| One opportunity search | 20 credits |
| One contact reveal (organizer name, email, LinkedIn) | 20 credits |

- Credits are taken **before** any AI work starts, so we never do paid work for free.
- If a search or contact lookup fails, the credits are **refunded automatically**.
- Owner accounts (you) never use credits — your searches are free and unlimited.

---

## 2. The four kinds of credits

A customer's balance is made of up to four "buckets". You can see them on the
customer's Overview and Usage pages.

| Bucket | Where it comes from | Does it expire? |
|---|---|---|
| **Trial** | Free trial on signup (1 search + 2 contacts) | Yes — after **7 days** |
| **Monthly** | Their plan, refilled every month | Yes — when their paid period ends (e.g. after cancelling) |
| **Rollover** | Unused monthly credits carried into the next month | Same as monthly |
| **Manual** | Credits **you** give them, and credit packs they buy | **Never** |

**Spending order:** trial first (for the free search and 2 free contacts), then
rollover, then monthly, then manual. So credits you gave them are used last.

**Rollover cap:** monthly + rollover together can never go above **2× their plan's
monthly amount**. Example: Starter (1,000/month) can hold at most 2,000 plan credits.
Manual credits don't count toward this cap.

---

## 3. Plans and prices

| Plan | Monthly | Annual (pay 10 months, get 12) | Credits per month |
|---|---|---|---|
| Starter | $79 | $790 | 1,000 |
| Growth | $199 | $1,990 | 2,500 |
| Scale | $499 | $4,990 | 6,500 |

- Annual customers still get their credits **one month at a time**, not all at once.
- Credit top-ups (one-time purchase, never expire): the customer picks any amount from
  $20 to $2,000. Paying a plan's price buys exactly that plan's credits ($79 = 1,000,
  $199 = 2,500, $499 = 6,500); amounts in between scale smoothly
  (quick picks: $20 = 253, $50 = 632, $100 = 1,262).
- A failed payment never gives credits.
- Stripe is in **test mode** — no real money moves until we switch to live.

---

## 4. Free trial

- Every new customer (one per email address) gets **1 search + 2 contact reveals**.
- It lasts **7 days** from when they verify their email. After that, unused trial
  actions disappear.
- No card is needed. Their results stay in their workspace forever.
- Cost to us: about **$1.40** per fully-used trial (at most about $2).

### Trial emails (sent automatically once a day, 10am US Eastern)

| Email | When | Who gets it |
|---|---|---|
| "Your free search is done" | Right after they use their free search | Trial users |
| "Your free trial ends in 2 days" | 2 days before expiry | Trial users who haven't searched yet |
| "Your free trial has ended" | The day it expires | Trial users who never searched |

Paid customers never get trial emails. Each email is sent only once per person.

---

## 5. What happens when someone runs out of credits

1. The search button turns grey and says **"Plan required"**, with a link to Billing.
2. Even if they try to get around the button, the server checks their credits first
   and refuses — no AI runs, no cost to us.
3. During a search, each contact is paid for before it's looked up. If credits run
   out halfway, the remaining contacts are simply skipped.

---

## 6. The admin page (Members & Usage)

Only owners can see it. Owners are not listed in the members table.

### Top cards
- **AI spend this month** — what AI actually cost us this month (lifetime underneath).
- **Average action cost** — average AI cost per search/contact. Target is under $0.40.
- **Research runs / Web searches** — how much work the AI has done.

### Members table columns
- **Plan** — their paid plan, or "No paid plan".
- **Credits** — their current total balance.
- **Cycle spend / Lifetime** — how much AI money they've cost us this month / ever.
- **Flags** — warnings:
  - **Margin risk** — they cost us more than 55% of what they pay this month.
  - **Ceiling** — they tried to search or reveal contacts with no credits left
    3+ times in the last 24 hours. Usually a good moment to offer an upgrade or
    credit pack.
- **Access** — Active or Suspended.

### Buttons
| Button | What it does |
|---|---|
| **View** | Opens their details: recent searches, credit history, spend. |
| **Credits** | Give or take away credits (see below). |
| **Suspend / Activate** | Suspend blocks them from signing in and using the app. Activate lets them back in. You'll be asked for a reason. |
| **Login as** | See the app exactly as they see it (see below). |

Every button asks for a reason, and every change is saved in **Audit history** at
the bottom of the page.

---

## 7. Giving or taking away credits

1. Click **Credits** next to the person.
2. Choose **Give credits** or **Take away credits**.
3. Tap a quick amount (20 = 1 search, 100, 500, 1,000) or type your own number.
4. Write a short reason (at least 3 letters) — the button stays grey until you do.
5. Check the **New balance** line, then confirm.

Good to know:
- Credits you **give** go into the **Manual** bucket and **never expire**.
- You can't take away more than they currently have.
- **Taking away is permanent.** If you take away credits that came from their plan,
  next month's refill does **not** undo it — the removal stays on their account until
  you give credits back. Only take away credits you meant to remove for good
  (e.g. ones you added by mistake).

Common uses:
- Refund a bad search → give **20**.
- Goodwill / apology → give **100**.
- Undo a mistake → take away the same amount you added.

---

## 8. "Login as" (viewing a customer's account)

Use it to see exactly what a customer sees when helping them.

- Click **Login as** → confirm. The page reloads as that customer.
- A **yellow bar** at the top says whose account you're viewing. The sidebar also
  shows a **"Viewing as customer"** box.
- To go back, click **"← Return to admin"** (in the yellow bar or the sidebar).
- It ends by itself after **30 minutes**.
- Anything you do while viewing (e.g. running a search) happens **on their account**
  and uses **their** credits — so look, don't click, unless you mean it.
- Every start and stop is recorded in the audit history.

---

## 9. Owner dashboard and Billing (owner view)

- **Profit vs AI spent** — monthly revenue from active plans, minus this month's AI
  spend, equals estimated profit.
- **New accounts** — joined in the last 14 days.
- **Trial ending** — trial expires within 2 days, or they already used their free search.
- **Annual plans** — customers on yearly billing.
- **Monthly renewing** — monthly plans renewing within 7 days.
- **Billing → Plans and payments** — every customer's plan, price, total paid (from
  Stripe), AI spend, status, and next date.

Test accounts are hidden from all of these numbers.

---

## 10. Where to get help

Technical details for developers live in `README.md` and the other files in `docs/`.
