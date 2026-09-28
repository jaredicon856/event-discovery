import Link from "next/link";
import {
  MONTHLY_ENDING_DAYS,
  NEW_ACCOUNT_DAYS,
  formatUsd,
  ownerClientStatusLabel,
  type OwnerBillingSnapshot,
  type OwnerClientRow,
} from "@/lib/ownerBilling";
import { formatAccountDate } from "@/lib/timezone";

function ClientIdentity({ client }: { client: OwnerClientRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-icon-text">
        {client.displayName || client.email}
      </p>
      <p className="mt-0.5 truncate text-xs text-icon-text-light">
        {client.displayName ? client.email : client.company || "—"}
      </p>
    </div>
  );
}

function StatusPill({ client }: { client: OwnerClientRow }) {
  const tone =
    client.status === "active_plan"
      ? "bg-emerald-50 text-emerald-800"
      : client.status === "trial_ending" || client.status === "past_due"
        ? "bg-amber-50 text-amber-800"
        : client.status === "trial"
          ? "bg-sky-50 text-sky-800"
          : "bg-stone-100 text-stone-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {ownerClientStatusLabel(client.status)}
    </span>
  );
}

function SegmentList({
  title,
  hint,
  clients,
  empty,
}: {
  title: string;
  hint: string;
  clients: OwnerClientRow[];
  empty: string;
}) {
  return (
    <div className="premium-card flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="premium-eyebrow">{title}</p>
          <p className="mt-2 text-sm text-icon-text-light">{hint}</p>
        </div>
        <p className="text-2xl font-semibold tracking-[-.04em]">{clients.length}</p>
      </div>
      <ul className="mt-5 flex-1 divide-y divide-icon-border">
        {clients.slice(0, 5).map((client) => (
          <li key={client.id} className="flex items-center justify-between gap-3 py-3">
            <ClientIdentity client={client} />
            <Link
              href={`/admin?member=${client.id}`}
              className="shrink-0 text-xs font-semibold text-icon-primary hover:underline"
            >
              View
            </Link>
          </li>
        ))}
        {clients.length === 0 && (
          <li className="py-6 text-sm text-icon-text-light">{empty}</li>
        )}
      </ul>
    </div>
  );
}

export function OwnerBillingPanel({ snapshot }: { snapshot: OwnerBillingSnapshot }) {
  const { clients, mrrUsd, arrUsd, aiSpendMonthUsd, estimatedMonthProfitUsd, marginPct, segments } =
    snapshot;
  const revenueShare = mrrUsd > 0 ? Math.min(100, Math.round((aiSpendMonthUsd / mrrUsd) * 100)) : 0;
  const profitPositive = estimatedMonthProfitUsd >= 0;

  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="animate-enter grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="premium-eyebrow">Owner billing</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-.055em] sm:text-5xl">
              Client revenue and plan health.
            </h1>
            <p className="premium-subtitle mt-4">
              Track what each account pays, which plan they are on, and how active catalog revenue
              compares to measured AI spend this month.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="premium-button flex items-center border border-icon-border bg-icon-surface hover:border-icon-primary"
            >
              Owner dashboard
            </Link>
            <Link
              href="/admin"
              className="premium-button flex items-center bg-icon-primary text-white"
            >
              Manage members
            </Link>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <div
            className="premium-card-dark reveal-card p-7 sm:p-8"
            style={{ "--reveal-index": 0 } as React.CSSProperties}
          >
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#d4ad62]">
              This month · active plans
            </p>
            <div className="mt-8 grid gap-8 sm:grid-cols-3">
              <div>
                <p className="text-sm text-white/55">Catalog MRR</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-.05em]">{formatUsd(mrrUsd)}</p>
                <p className="mt-2 text-xs text-white/45">{formatUsd(arrUsd)} annualized</p>
              </div>
              <div>
                <p className="text-sm text-white/55">AI spend</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-.05em]">
                  {formatUsd(aiSpendMonthUsd)}
                </p>
                <p className="mt-2 text-xs text-white/45">Customer usage only</p>
              </div>
              <div>
                <p className="text-sm text-white/55">Est. profit</p>
                <p
                  className={`mt-2 text-4xl font-semibold tracking-[-.05em] ${
                    profitPositive ? "text-[#d4ad62]" : "text-amber-200"
                  }`}
                >
                  {formatUsd(estimatedMonthProfitUsd)}
                </p>
                <p className="mt-2 text-xs text-white/45">
                  {marginPct == null ? "No active plan revenue" : `${marginPct}% margin`}
                </p>
              </div>
            </div>
            <div className="mt-8">
              <div className="mb-2 flex justify-between text-xs text-white/50">
                <span>AI cost share of MRR</span>
                <span>{revenueShare}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#8f6827] to-[#d6ae61] transition-[width] duration-500"
                  style={{ width: `${Math.max(mrrUsd > 0 ? 4 : 0, revenueShare)}%` }}
                />
              </div>
            </div>
          </div>

          <div
            className="premium-card reveal-card flex flex-col justify-between p-6 sm:p-7"
            style={{ "--reveal-index": 1 } as React.CSSProperties}
          >
            <div>
              <p className="premium-eyebrow">Owner account</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-.04em]">
                Unlimited · unbilled
              </h2>
              <p className="mt-3 text-sm leading-6 text-icon-text-light">
                Your owner seat is excluded from client revenue. Provider costs for owner searches
                stay on the usage page as unbilled activity.
              </p>
            </div>
            <Link
              href="/usage"
              className="mt-6 inline-flex rounded-lg border border-icon-border px-4 py-2.5 text-sm font-semibold hover:border-icon-primary"
            >
              View owner usage
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SegmentList
            title="New accounts"
            hint={`Joined in the last ${NEW_ACCOUNT_DAYS} days`}
            clients={segments.newAccounts}
            empty="No brand-new accounts right now."
          />
          <SegmentList
            title="Trial ending"
            hint="Low discovery or contact allowance left"
            clients={segments.trialEnding}
            empty="No trials near exhaustion."
          />
          <SegmentList
            title="Annual plans"
            hint="Active yearly subscriptions"
            clients={segments.annual}
            empty="No annual subscribers yet."
          />
          <SegmentList
            title="Monthly renewing"
            hint={`Cycle ends within ${MONTHLY_ENDING_DAYS} days`}
            clients={segments.monthlyEnding}
            empty="No monthly renewals this week."
          />
        </section>

        <section
          className="premium-card reveal-card overflow-hidden p-0"
          style={{ "--reveal-index": 2 } as React.CSSProperties}
        >
          <div className="border-b border-icon-border px-6 py-5 sm:px-7">
            <p className="premium-eyebrow">Clients</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">
              Plans and payments
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-icon-text-light">
              Cycle price comes from the active catalog plan. Paid totals sum confirmed Stripe
              invoices when a customer is linked.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-icon-background text-[11px] font-semibold uppercase tracking-[.12em] text-icon-text-light">
                <tr>
                  <th className="px-6 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Pays</th>
                  <th className="px-4 py-3 font-semibold">Paid to date</th>
                  <th className="px-4 py-3 font-semibold">AI spend</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Next date</th>
                  <th className="px-6 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-icon-border">
                {clients.map((client) => (
                  <tr key={client.id} className="align-top hover:bg-icon-primary-light/40">
                    <td className="px-6 py-4">
                      <ClientIdentity client={client} />
                      {client.isNew && (
                        <span className="mt-2 inline-flex rounded-full bg-icon-primary-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-icon-primary">
                          New
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">
                        {client.planName ??
                          (client.status.startsWith("trial") ? "Free trial" : "—")}
                      </p>
                      <p className="mt-1 text-xs text-icon-text-light">
                        {client.billingInterval === "year"
                          ? "Annual"
                          : client.billingInterval === "month"
                            ? "Monthly"
                            : client.trialDiscoveryRemaining != null
                              ? `${client.trialDiscoveryRemaining} search · ${client.trialContactsRemaining ?? 0} contacts`
                              : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold">{formatUsd(client.cyclePriceUsd)}</p>
                      <p className="mt-1 text-xs text-icon-text-light">
                        {client.billingInterval === "year"
                          ? "per year"
                          : client.cyclePriceUsd > 0
                            ? "per month"
                            : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {formatUsd(client.lifetimePaidUsd)}
                    </td>
                    <td className="px-4 py-4 text-icon-text-light">
                      {formatUsd(client.aiSpendUsd)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill client={client} />
                    </td>
                    <td className="px-4 py-4 text-icon-text-light">
                      {client.periodEnd
                        ? formatAccountDate(client.periodEnd)
                        : formatAccountDate(client.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin?member=${client.id}`}
                        className="text-xs font-semibold text-icon-primary hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-sm text-icon-text-light">
                      No customer accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
