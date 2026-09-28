import Link from "next/link";
import { CREDIT_COSTS, getCreditBalances } from "@/lib/credits";
import { PLANS, TOPUP_PACKS, areAnnualPlansConfigured, areTopupPacksConfigured } from "@/lib/stripe";
import { BuyCreditsButton, ManageSubscriptionButton } from "@/components/BillingActions";
import { BillingPlansGrid } from "@/components/BillingPlansGrid";
import { OwnerBillingPanel } from "@/components/OwnerBillingPanel";
import { requireActiveUser } from "@/lib/access";
import { loadOwnerBillingSnapshot } from "@/lib/ownerBilling";
import { formatAccountDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null | undefined) {
  return formatAccountDate(iso);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const checkout = typeof params.checkout === "string" ? params.checkout : undefined;

  const { user, profile, service: supabase } = await requireActiveUser();
  if (profile.role === "super_admin") {
    const snapshot = await loadOwnerBillingSnapshot(supabase);
    return <OwnerBillingPanel snapshot={snapshot} />;
  }

  const [{ data: subscription }, { data: ledger }, balances] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, credits_per_cycle, current_period_end, stripe_subscription_id, billing_interval")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select("delta, reason, note, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    getCreditBalances(supabase, user.id),
  ]);
  const balance = balances.total;

  const activePlan = subscription ? PLANS.find((p) => p.id === subscription.plan) : undefined;
  const planIsLive = subscription?.status === "active" || subscription?.status === "past_due";
  const allotment = subscription?.credits_per_cycle ?? 0;
  const usedThisCycle = Math.max(0, allotment - balances.subscription);
  const usedPct = allotment > 0 ? Math.min(100, Math.round((usedThisCycle / allotment) * 100)) : 0;
  // "Add credits" links here. Without a live plan there are no top-up packs to
  // scroll to, so the same anchor lands on the plan chooser instead.
  const topupsAvailable = planIsLive && areTopupPacksConfigured();
  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="animate-enter grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="premium-eyebrow">Membership & credits</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-.055em] sm:text-5xl">
              Choose the pace of your opportunity pipeline.
            </h1>
            <p className="premium-subtitle mt-4">
              One clear monthly price. Every plan includes the full research workspace, exports,
              saved lists, and verified opportunity tracking.
            </p>
          </div>
          <Link href="/opportunities?tab=new" className="premium-button flex items-center border border-icon-border bg-icon-surface hover:border-icon-primary">
            Preview the search workspace
          </Link>
        </header>

        {checkout === "success" && (
          <div className="animate-enter rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
            Checkout complete. Credits appear as soon as Stripe confirms the payment (usually a few
            seconds). Refresh if the balance has not updated yet.
          </div>
        )}
        {checkout === "cancelled" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Checkout was cancelled. No charge was made.
          </div>
        )}

        {!planIsLive && (
          <section className="premium-card-dark reveal-card grid gap-7 p-7 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-[#d4ad62]">Your next step</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">
                Select a plan to keep finding credible stages.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                Your saved results stay private. Choose the monthly research capacity that fits
                your pace—there are no feature gates or automatic top-ups.
              </p>
            </div>
            <a href="#plans" className="premium-button flex items-center justify-center bg-[#c79a45] text-[#041819]">
              Compare plans
            </a>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <div className="premium-card reveal-card p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="premium-eyebrow">Available balance</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">{balance.toLocaleString()}</p>
                <p className="mt-1 text-sm text-icon-text-light">research credits ready to use</p>
              </div>
              <div className="flex flex-col items-end gap-2 text-sm font-semibold text-icon-primary">
                <Link href="/billing/invoices" className="hover:underline">
                  Invoice history
                </Link>
                <Link href="/usage" className="hover:underline">
                  Full usage history
                </Link>
              </div>
            </div>
            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-icon-primary-light">
              <div
                className="h-full rounded-full bg-icon-primary transition-[width] duration-500"
                style={{ width: `${planIsLive ? Math.max(4, 100 - usedPct) : 0}%` }}
              />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-icon-text-light sm:grid-cols-4">
              {[
                ["Trial", balances.trial],
                ["Monthly", balances.subscription],
                ["Rollover", balances.rollover],
                ["Manual", balances.manual],
              ].map(([label, value]) => (
                <span key={label} className="rounded-xl bg-icon-background px-4 py-3">
                  {label}
                  <strong className="mt-1 block text-lg text-icon-text">{Number(value).toLocaleString()}</strong>
                </span>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-icon-text-light">
              {planIsLive
                ? `${usedThisCycle} of ${allotment} credits used this cycle. Discovery costs ${CREDIT_COSTS.discovery} credits; finding contacts costs ${CREDIT_COSTS.enrichment} per event. Renews ${formatDate(subscription?.current_period_end)}.`
                : "No active plan. Choose a plan below to get a monthly credit allotment."}
            </p>
          </div>

          <div className="premium-card reveal-card flex flex-col justify-between p-6 sm:p-7" style={{ "--reveal-index": 1 } as React.CSSProperties}>
            <div>
              <p className="premium-eyebrow">Current plan</p>
              <p className="mt-4 text-3xl font-semibold tracking-[-.04em]">{planIsLive ? activePlan?.name : "Not selected"}</p>
              <p className="mt-2 text-sm leading-6 text-icon-text-light">
              {planIsLive && subscription
                ? `${subscription.status.replace("_", " ")} · ${subscription.credits_per_cycle} credits/cycle`
                : "Choose your monthly capacity below. Your existing results remain available."}
              </p>
            </div>
            {planIsLive ? (
              <div className="mt-6">
                <ManageSubscriptionButton />
              </div>
            ) : (
              <a href="#plans" className="premium-button mt-6 flex items-center justify-center bg-icon-primary text-white">
                Select a plan
              </a>
            )}
          </div>
        </section>

        {!topupsAvailable && <span id="add-credits" aria-hidden className="block scroll-mt-8" />}

        <BillingPlansGrid
          planIsLive={Boolean(planIsLive)}
          activePlanId={activePlan?.id}
          activeInterval={subscription?.billing_interval === "year" ? "year" : "month"}
          annualConfigured={areAnnualPlansConfigured()}
        />

        {topupsAvailable && (
          <section id="add-credits" className="premium-card reveal-card scroll-mt-8 p-6 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="premium-eyebrow">Need capacity now</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Buy more credits</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-icon-text-light">
                  One-time top-ups add credits to your account instantly—no change to your monthly
                  plan or renewal date.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {TOPUP_PACKS.map((pack) => (
                <div
                  key={pack.id}
                  className={`rounded-2xl border p-5 ${
                    pack.id === "medium" ? "border-icon-primary bg-icon-primary-light" : "border-icon-border bg-icon-background"
                  }`}
                >
                  {pack.id === "medium" && (
                    <span className="mb-2 inline-block rounded-full bg-icon-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-white">
                      Best value
                    </span>
                  )}
                  <p className="text-sm font-semibold text-icon-primary">{pack.name}</p>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-[-.05em]">${pack.priceUsd}</span>
                    <span className="text-xs text-icon-text-light">one-time</span>
                  </p>
                  <p className="mt-1 text-sm text-icon-text-light">{pack.credits.toLocaleString()} credits</p>
                  <div className="mt-4">
                    <BuyCreditsButton
                      packId={pack.id}
                      label={`Buy ${pack.credits.toLocaleString()} credits`}
                      featured={pack.id === "medium"}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-icon-text-light">
              Top-up credits never expire while your account stays active and are spent after
              your monthly and rollover balances.
            </p>
          </section>
        )}

        <section className="premium-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div><p className="premium-eyebrow">Account ledger</p><h2 className="mt-2 text-xl font-semibold">Recent credit activity</h2></div>
            <Link href="/usage" className="text-sm font-semibold text-icon-primary hover:underline">View all</Link>
          </div>
          {ledger && ledger.length > 0 ? (
            <ul className="mt-5 divide-y divide-icon-border text-sm">
              {ledger.map((row, i) => (
                <li key={`${row.created_at}-${i}`} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{row.note || row.reason.replace(/_/g, " ")}</p>
                    <p className="text-xs text-icon-text-light">{formatDate(row.created_at)}</p>
                  </div>
                  <p className={row.delta >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-icon-text"}>
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-icon-text-light">No ledger entries yet.</p>
          )}
        </section>

        <p className="text-xs text-icon-text-light">
          Need account help? Visit{" "}
          <Link href="/settings" className="text-icon-primary hover:underline">Settings</Link>
          {" "}or contact Project ICON.
        </p>
      </div>
    </div>
  );
}
