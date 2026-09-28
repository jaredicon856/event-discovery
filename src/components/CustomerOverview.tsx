import Link from "next/link";
import { requireActiveUser } from "@/lib/access";
import { getCreditBalances } from "@/lib/credits";
import { AnimatedGreeting } from "@/components/AnimatedGreeting";
import { formatAccountDate } from "@/lib/timezone";
import { effectiveTrial, trialDaysLeftLabel } from "@/lib/trial";

export async function CustomerOverview() {
  const { profile, service } = await requireActiveUser();
  const { data: subscription } = await service
    .from("subscriptions")
    .select("plan, status, credits_per_cycle, current_period_start, current_period_end, cancel_at_period_end, access_ends_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const periodStart = subscription?.current_period_start ?? "1970-01-01T00:00:00.000Z";
  const [balances, { data: recentRuns }, { data: cycleRuns }, { data: ledger }, { data: operations }, { data: trialRow }] =
    await Promise.all([
      getCreditBalances(service, profile.id),
      service
        .from("discovery_runs")
        .select("id, sector, query, status, events_found, credits_charged, credits_refunded, created_at")
        .eq("profile_id", profile.id)
        .eq("run_kind", "customer")
        .order("created_at", { ascending: false })
        .limit(5),
      service
        .from("discovery_runs")
        .select("events_found")
        .eq("profile_id", profile.id)
        .eq("run_kind", "customer")
        .gte("created_at", periodStart),
      service
        .from("credit_ledger")
        .select("id, delta, reason, note, balance_bucket, created_at")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(12),
      service
        .from("credit_operations")
        .select("action, amount, status")
        .eq("profile_id", profile.id)
        .gte("created_at", periodStart),
      service
        .from("trial_entitlements")
        .select("discovery_remaining, contact_lookups_remaining, expires_at")
        .eq("profile_id", profile.id)
        .maybeSingle(),
    ]);
  const trial = effectiveTrial(trialRow);

  const allCycleRuns = cycleRuns ?? [];
  const creditsUsed = (operations ?? [])
    .filter((operation) => operation.status === "completed")
    .reduce((sum, operation) => sum + operation.amount, 0);
  const contactSearches = (operations ?? []).filter(
    (operation) => operation.action === "enrichment_usage" && operation.status === "completed"
  ).length;
  const nextDate = subscription?.cancel_at_period_end
    ? subscription.access_ends_at ?? subscription.current_period_end
    : subscription?.current_period_end;
  const hasPaidPlan = Boolean(subscription && ["active", "past_due"].includes(subscription.status));
  const trialComplete = !hasPaidPlan && (!trial || trial.discoveryRemaining === 0);
  const requiresPlan = trialComplete && balances.total < 20;
  const displayName = profile.display_name || profile.full_name || profile.email.split("@")[0];
  const recentSearches = recentRuns ?? [];

  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="animate-enter grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="premium-eyebrow">Opportunity intelligence</p>
            <h1 className="premium-title mt-4"><AnimatedGreeting name={displayName} /></h1>
            <p className="premium-subtitle mt-5">
              Find credible stages, understand each fit, and move from research to outreach.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={hasPaidPlan ? "/opportunities?tab=new" : "/billing#plans"} className="premium-button flex items-center bg-icon-primary text-white">
              {hasPaidPlan ? "Start a search" : "Choose your plan"}
            </Link>
            <Link href={hasPaidPlan || !requiresPlan ? "/opportunities?tab=new" : "/opportunities"} className="premium-button flex items-center border border-icon-border bg-icon-surface hover:border-icon-primary">
              {hasPaidPlan || !requiresPlan ? "Find opportunities" : "View saved results"}
            </Link>
          </div>
        </header>

        <section className="mt-12 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <Link href="/usage" className="premium-card-dark reveal-card group block p-7 transition-transform hover:-translate-y-1 sm:p-8" style={{ "--reveal-index": 0 } as React.CSSProperties}>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#d4ad62]">Available research credits</p>
            <div className="mt-7 flex items-end justify-between gap-4">
              <p className="text-6xl font-semibold tracking-[-.07em]">{balances.total.toLocaleString()}</p>
              <span className="text-sm font-semibold text-[#d4ad62] opacity-70 transition-opacity group-hover:opacity-100">View usage →</span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-4">
              <div><p className="text-white/50">Trial</p><p className="mt-1 font-semibold">{balances.trial.toLocaleString()}</p></div>
              <div><p className="text-white/50">Monthly</p><p className="mt-1 font-semibold">{balances.subscription.toLocaleString()}</p></div>
              <div><p className="text-white/50">Rollover</p><p className="mt-1 font-semibold">{balances.rollover.toLocaleString()}</p></div>
              <div><p className="text-white/50">Manual</p><p className="mt-1 font-semibold">{balances.manual.toLocaleString()}</p></div>
            </div>
          </Link>
          <Link href="/billing" className="premium-card reveal-card flex flex-col justify-between p-7" style={{ "--reveal-index": 1 } as React.CSSProperties}>
            <p className="premium-eyebrow">Current plan</p>
            <p className="mt-8 text-3xl font-semibold capitalize tracking-[-.04em]">
              {hasPaidPlan ? subscription?.plan : trial ? (trial.expired ? "Trial expired" : trialComplete ? "Trial complete" : "Free trial") : "No active plan"}
            </p>
            <p className="mt-3 text-sm leading-6 text-icon-text-light">
              {hasPaidPlan && subscription
                ? `${subscription.credits_per_cycle.toLocaleString()} credits per month · ${subscription.status}`
                : !trial
                  ? balances.total >= 20
                    ? "You can continue research with available manual credits."
                    : "Choose a plan to run discovery and contact research."
                  : trialComplete
                  ? "Your results remain available. Choose a plan when you are ready to research more."
                  : `${trial.discoveryRemaining} search and ${trial.contactsRemaining} contact lookups remaining · ${trialDaysLeftLabel(trial.daysLeft)}.`}
            </p>
            {hasPaidPlan && nextDate && (
              <p className="mt-7 border-t border-icon-border pt-4 text-sm">
                <span className="text-icon-text-light">{subscription?.cancel_at_period_end ? "Access ends" : "Next credit grant"}:</span>{" "}
                {formatAccountDate(nextDate)}
              </p>
            )}
            {!hasPaidPlan && <span className="mt-6 text-sm font-semibold text-icon-primary">Compare monthly plans →</span>}
          </Link>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Credits used this cycle", creditsUsed.toLocaleString(), "/usage"],
            ["Discovery searches", allCycleRuns.length.toLocaleString(), "/opportunities?tab=previous"],
            ["Events found", allCycleRuns.reduce((sum, run) => sum + run.events_found, 0).toLocaleString(), "/opportunities?tab=results"],
            ["Contact searches", contactSearches.toLocaleString(), "/usage"],
          ].map(([label, value, href], index) => (
            <Link key={label} href={href} className="premium-card reveal-card group p-5" style={{ "--reveal-index": index + 2 } as React.CSSProperties}>
              <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">{label}</p>
              <div className="mt-2 flex items-end justify-between"><p className="text-2xl font-semibold">{value}</p><span className="text-icon-primary opacity-0 transition-opacity group-hover:opacity-100">→</span></div>
            </Link>
          ))}
        </section>

        <p className="mt-6 rounded-xl border border-icon-primary/20 bg-icon-primary-light px-5 py-4 text-sm leading-6">
          20 credits per discovery search, plus 20 credits for each event researched for contacts. A search with seven contact lookups uses 160 credits.
        </p>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <div>
            <div className="flex items-end justify-between"><div><p className="premium-eyebrow">Your workspace</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Recent searches</h2></div><Link href="/opportunities?tab=previous" className="text-sm font-semibold text-icon-primary hover:underline">View all</Link></div>
            <div className="mt-5 space-y-3">
              {recentSearches.map((run, index) => {
                const legacyEmpty = run.status === "completed" && run.events_found === 0;
                return (
                <Link key={run.id} href={`/opportunities?tab=results&runId=${run.id}`} className="reveal-card premium-card block p-5 transition-all hover:-translate-y-0.5 hover:border-icon-primary" style={{ "--reveal-index": index } as React.CSSProperties}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{run.query}</p><p className="mt-1 text-xs text-icon-text-light">{run.sector} · {formatAccountDate(run.created_at)}</p></div><span className="text-xs font-semibold capitalize text-icon-text-light">{run.status.replaceAll("_", " ")}</span></div>
                  {legacyEmpty && <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-600">Legacy result · No opportunities</p>}
                  <p className="mt-3 text-sm text-icon-text-light">{run.events_found} opportunities · {run.credits_charged - run.credits_refunded} net credits</p>
                </Link>
              )})}
              {recentSearches.length === 0 && <p className="premium-card p-6 text-sm text-icon-text-light">Your searches will appear here.</p>}
            </div>
          </div>
          <div>
            <p className="premium-eyebrow">Credit activity</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Usage history</h2>
            <div className="premium-card mt-5 divide-y divide-icon-border overflow-hidden">
              {(ledger ?? []).map((entry) => (
                <Link key={entry.id} href="/usage" className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-icon-primary-light">
                  <div><p className="font-medium capitalize">{entry.reason.replaceAll("_", " ")}</p><p className="text-xs text-icon-text-light">{entry.balance_bucket ?? "legacy"} · {formatAccountDate(entry.created_at)}</p></div>
                  <span className={entry.delta >= 0 ? "font-semibold text-emerald-700" : "font-semibold"}>{entry.delta >= 0 ? "+" : ""}{entry.delta}</span>
                </Link>
              ))}
              {(ledger ?? []).length === 0 && <p className="p-5 text-sm text-icon-text-light">No credit activity yet.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
