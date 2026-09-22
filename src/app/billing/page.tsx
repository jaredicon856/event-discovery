export const dynamic = "force-static";

const DRAFT_TIERS = [
  { name: "Starter", price: "$79", credits: "TBD", note: "Pending margin analysis" },
  { name: "Growth", price: "$199", credits: "TBD", note: "Pending margin analysis" },
  { name: "Scale", price: "$499", credits: "TBD", note: "Pending margin analysis" },
];

export default function BillingPage() {
  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-icon-text-light">
            Manage your plan, credit balance, and top-ups.
          </p>
        </header>

        <div className="rounded-lg border border-icon-primary bg-icon-primary-light p-4 text-sm text-icon-text">
          <p className="font-semibold">Preview layout — not yet wired to real billing</p>
          <p className="mt-1 text-icon-text-light">
            This is a design preview so we can agree on the shape of it before building Stripe
            subscriptions, a real credit ledger, and usage metering. Numbers below are placeholders —
            final credit allocations and prices depend on the cost/margin research currently running.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-icon-border p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">
              Credit balance
            </p>
            <p className="mt-1 text-3xl font-semibold">— credits available</p>
            <div className="mt-4 h-2 w-full rounded-full bg-icon-surface">
              <div className="h-2 w-0 rounded-full bg-icon-primary" />
            </div>
            <p className="mt-3 text-sm text-icon-text-light">
              No plan is active yet. Once billing is built, this shows your current cycle&apos;s
              credits, renewal date, and burn rate.
            </p>
          </div>

          <div className="rounded-lg border border-icon-border bg-icon-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">
              Current plan
            </p>
            <p className="mt-1 text-lg font-semibold">No active plan</p>
            <button
              disabled
              className="mt-4 w-full rounded bg-icon-primary px-3 py-2 text-sm font-medium text-icon-background opacity-50"
            >
              Choose a plan
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-icon-border p-5">
          <p className="mb-4 text-sm font-semibold">Available plans (draft — subject to change)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {DRAFT_TIERS.map((tier) => (
              <div key={tier.name} className="rounded-lg border border-icon-border p-4">
                <p className="font-semibold">{tier.name}</p>
                <p className="mt-1 text-2xl font-semibold">
                  {tier.price}
                  <span className="text-sm font-normal text-icon-text-light">/mo</span>
                </p>
                <p className="mt-2 text-sm text-icon-text-light">{tier.credits} credits/month</p>
                <p className="mt-1 text-xs text-icon-text-light">{tier.note}</p>
                <button
                  disabled
                  className="mt-4 w-full rounded border border-icon-border px-3 py-1.5 text-sm font-medium text-icon-text-light opacity-50"
                >
                  Coming soon
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-icon-border p-5">
          <p className="text-sm font-semibold">Top up credits</p>
          <p className="mt-1 text-sm text-icon-text-light">
            One-click top-ups at your plan&apos;s rate. Available once billing is wired up.
          </p>
        </div>
      </div>
    </div>
  );
}
