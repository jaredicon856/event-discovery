import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { AnimatedGreeting } from "@/components/AnimatedGreeting";
import {
  MONTHLY_ENDING_DAYS,
  NEW_ACCOUNT_DAYS,
  formatUsd,
  loadOwnerBillingSnapshot,
  type OwnerClientRow,
} from "@/lib/ownerBilling";
import { formatAccountDate } from "@/lib/timezone";

function SegmentCard({
  title,
  count,
  hint,
  clients,
  index,
}: {
  title: string;
  count: number;
  hint: string;
  clients: OwnerClientRow[];
  index: number;
}) {
  return (
    <div
      className="premium-card reveal-card flex min-h-52 flex-col p-6"
      style={{ "--reveal-index": index } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="premium-eyebrow">{title}</p>
          <p className="mt-3 text-sm leading-5 text-icon-text-light">{hint}</p>
        </div>
        <p className="text-3xl font-semibold tracking-[-.05em]">{count}</p>
      </div>
      <ul className="mt-5 space-y-3 border-t border-icon-border pt-4">
        {clients.slice(0, 3).map((client) => (
          <li key={client.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">
              {client.displayName || client.email}
            </span>
            <Link
              href={`/admin?member=${client.id}`}
              className="shrink-0 text-xs font-semibold text-icon-primary hover:underline"
            >
              View
            </Link>
          </li>
        ))}
        {clients.length === 0 && (
          <li className="text-sm text-icon-text-light">None right now</li>
        )}
      </ul>
    </div>
  );
}

export async function OwnerOverview() {
  const { profile, service } = await requireSuperAdmin();
  const [snapshot, { data: ownerRuns }, { data: attentionRuns }, { data: audit }] =
    await Promise.all([
      loadOwnerBillingSnapshot(service),
      service
        .from("discovery_runs")
        .select("id, query, sector, status, events_found, contacts_found, error_message, created_at")
        .eq("profile_id", profile.id)
        .eq("run_kind", "customer")
        .order("created_at", { ascending: false })
        .limit(6),
      service
        .from("discovery_runs")
        .select("id, status", { count: "exact" })
        .eq("run_kind", "customer")
        .in("status", ["failed", "partial"])
        .order("created_at", { ascending: false })
        .limit(20),
      service
        .from("admin_audit_log")
        .select("id, action, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const activeMembers = snapshot.clients.filter(
    (client) => client.accessStatus === "active"
  ).length;
  const suspendedMembers = snapshot.clients.filter(
    (client) => client.accessStatus === "suspended"
  ).length;
  const displayName = profile.display_name || profile.full_name || "Owner";
  const recentSearches = ownerRuns ?? [];
  const costShare =
    snapshot.mrrUsd > 0
      ? Math.min(100, Math.round((snapshot.aiSpendMonthUsd / snapshot.mrrUsd) * 100))
      : 0;
  const profitPositive = snapshot.estimatedMonthProfitUsd >= 0;

  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="animate-enter grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="premium-eyebrow">Owner command center</p>
            <h1 className="premium-title mt-4">
              <AnimatedGreeting name={displayName} preserveCase />
            </h1>
            <p className="premium-subtitle mt-5">
              Revenue from active plans, measured AI spend, and the accounts that need attention.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/billing"
              className="premium-button flex items-center bg-icon-primary text-white"
            >
              Open billing
            </Link>
            <Link
              href="/admin"
              className="premium-button flex items-center border border-icon-border bg-icon-surface hover:border-icon-primary"
            >
              Manage members
            </Link>
          </div>
        </header>

        <section className="mt-12 grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
          <Link
            href="/billing"
            className="premium-card-dark reveal-card group min-h-64 p-7 transition-transform hover:-translate-y-1 sm:p-8"
            style={{ "--reveal-index": 0 } as React.CSSProperties}
          >
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#d4ad62]">
              Profit vs AI spent · this month
            </p>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              <div>
                <p className="text-sm text-white/55">Active plan MRR</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">
                  {formatUsd(snapshot.mrrUsd)}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/55">AI spend</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">
                  {formatUsd(snapshot.aiSpendMonthUsd)}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/55">Est. profit</p>
                <p
                  className={`mt-2 text-4xl font-semibold tracking-[-.05em] sm:text-5xl ${
                    profitPositive ? "text-[#d4ad62]" : "text-amber-200"
                  }`}
                >
                  {formatUsd(snapshot.estimatedMonthProfitUsd)}
                </p>
              </div>
            </div>
            <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8f6827] to-[#d6ae61] transition-[width] duration-500"
                style={{ width: `${Math.max(snapshot.mrrUsd > 0 ? 4 : 0, costShare)}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-white/55">
              {snapshot.marginPct == null
                ? "Catalog MRR comes online when customers activate a plan."
                : `${costShare}% of MRR is currently consumed by measured provider spend · ${snapshot.marginPct}% margin.`}
            </p>
            <p className="mt-4 text-xs font-semibold text-[#d4ad62] opacity-70 group-hover:opacity-100">
              Open client billing →
            </p>
          </Link>

          <div className="grid gap-4">
            <Link
              href="/admin"
              className="premium-card reveal-card flex min-h-[7.5rem] flex-col justify-between p-6"
              style={{ "--reveal-index": 1 } as React.CSSProperties}
            >
              <p className="premium-eyebrow">Customer base</p>
              <div>
                <p className="text-4xl font-semibold tracking-[-.05em]">{activeMembers}</p>
                <p className="mt-1 text-sm text-icon-text-light">
                  active · {suspendedMembers} suspended
                </p>
              </div>
            </Link>
            <Link
              href="/opportunities?tab=previous"
              className="premium-card reveal-card flex min-h-[7.5rem] flex-col justify-between p-6"
              style={{ "--reveal-index": 2 } as React.CSSProperties}
            >
              <p className="premium-eyebrow">Needs attention</p>
              <div>
                <p className="text-4xl font-semibold tracking-[-.05em]">
                  {(attentionRuns ?? []).length}
                </p>
                <p className="mt-1 text-sm text-icon-text-light">Failed or partial runs</p>
              </div>
            </Link>
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SegmentCard
            title="New accounts"
            count={snapshot.segments.newAccounts.length}
            hint={`Joined in the last ${NEW_ACCOUNT_DAYS} days`}
            clients={snapshot.segments.newAccounts}
            index={3}
          />
          <SegmentCard
            title="Trial ending"
            count={snapshot.segments.trialEnding.length}
            hint="Low trial searches or contact lookups left"
            clients={snapshot.segments.trialEnding}
            index={4}
          />
          <SegmentCard
            title="Annual plans"
            count={snapshot.segments.annual.length}
            hint="Active yearly subscribers"
            clients={snapshot.segments.annual}
            index={5}
          />
          <SegmentCard
            title="Monthly renewing"
            count={snapshot.segments.monthlyEnding.length}
            hint={`Cycle ends within ${MONTHLY_ENDING_DAYS} days`}
            clients={snapshot.segments.monthlyEnding}
            index={6}
          />
        </section>

        <section className="mt-12 grid gap-8 xl:grid-cols-[1.4fr_.8fr]">
          <div className="animate-enter" style={{ animationDelay: "180ms" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="premium-eyebrow">Private workspace</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">
                  Recent research
                </h2>
              </div>
              <Link
                href="/opportunities?tab=previous"
                className="text-sm font-semibold text-icon-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="mt-5 grid gap-3">
              {recentSearches.map((run, index) => {
                const legacyEmpty = run.status === "completed" && run.events_found === 0;
                return (
                  <Link
                    key={run.id}
                    href={`/opportunities?tab=results&runId=${run.id}`}
                    className="reveal-card group premium-card block p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-icon-primary hover:shadow-[var(--icon-shadow-soft)]"
                    style={{ "--reveal-index": index + 7 } as React.CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug group-hover:text-icon-primary">
                          {run.query}
                        </p>
                        <p className="mt-2 text-xs font-medium uppercase tracking-[.1em] text-icon-text-light">
                          {run.sector} · {formatAccountDate(run.created_at)}
                        </p>
                        <p className="mt-1 text-xs text-icon-text-light">
                          Run by {displayName} · {profile.email}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
                          legacyEmpty
                            ? "bg-stone-100 text-stone-600"
                            : "bg-icon-primary-light text-icon-primary"
                        }`}
                      >
                        {legacyEmpty
                          ? "Legacy · no opportunities"
                          : run.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="mt-5 flex items-center gap-5 border-t border-icon-border pt-4 text-sm text-icon-text-light">
                      <span>
                        <strong className="text-icon-text">{run.events_found}</strong>{" "}
                        opportunities
                      </span>
                      <span>
                        <strong className="text-icon-text">{run.contacts_found}</strong> contacts
                      </span>
                      <span className="ml-auto text-xs">Owner unbilled</span>
                    </div>
                    {run.error_message && (
                      <p className="mt-1 text-xs text-amber-700">{run.error_message}</p>
                    )}
                  </Link>
                );
              })}
              {recentSearches.length === 0 && (
                <p className="premium-card p-8 text-sm text-icon-text-light">
                  Your owner searches will appear here.
                </p>
              )}
            </div>
          </div>

          <div className="animate-enter" style={{ animationDelay: "260ms" }}>
            <p className="premium-eyebrow">Audit trail</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Administration</h2>
            <div className="premium-card mt-5 divide-y divide-icon-border overflow-hidden">
              {(audit ?? []).map((entry) => (
                <Link
                  key={entry.id}
                  href="/admin"
                  className="block px-5 py-4 transition-colors hover:bg-icon-primary-light"
                >
                  <p className="text-sm font-semibold capitalize">
                    {entry.action.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-icon-text-light">
                    {entry.reason} · {formatAccountDate(entry.created_at)}
                  </p>
                </Link>
              ))}
              {(audit ?? []).length === 0 && (
                <p className="p-5 text-sm text-icon-text-light">No recent admin activity.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
