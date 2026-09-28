import { requireActiveUser } from "@/lib/access";
import { getCreditBalances } from "@/lib/credits";
import { formatAccountDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const { profile, service } = await requireActiveUser();
  if (profile.role === "super_admin") {
    const { data: usage } = await service
      .from("ai_usage")
      .select("id, action, input_tokens, output_tokens, web_search_requests, estimated_cost_usd, billing_mode, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const spend = (usage ?? []).reduce((sum, entry) => sum + Number(entry.estimated_cost_usd), 0);
    return (
      <div className="min-h-screen px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-semibold">Owner usage</h1>
          <p className="mt-1 text-sm text-icon-text-light">Owner access · Unlimited usage. Calls remain measured and unbilled.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-icon-border p-4"><p className="text-xs uppercase text-icon-text-light">AI actions</p><p className="mt-2 text-2xl font-semibold">{usage?.length ?? 0}</p></div>
            <div className="rounded-xl border border-icon-border p-4"><p className="text-xs uppercase text-icon-text-light">Web searches</p><p className="mt-2 text-2xl font-semibold">{(usage ?? []).reduce((sum, entry) => sum + entry.web_search_requests, 0)}</p></div>
            <div className="rounded-xl border border-icon-border p-4"><p className="text-xs uppercase text-icon-text-light">Measured AI cost</p><p className="mt-2 text-2xl font-semibold">${spend.toFixed(2)}</p></div>
          </div>
          <div className="mt-6 divide-y divide-icon-border overflow-hidden rounded-xl border border-icon-border">
            {(usage ?? []).map((entry) => (
              <div key={entry.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_.7fr_.7fr]">
                <div><p className="font-medium capitalize">{entry.action}</p><p className="text-xs text-icon-text-light">{formatAccountDateTime(entry.created_at)}</p></div>
                <p className="text-icon-text-light">{entry.input_tokens.toLocaleString()} in · {entry.output_tokens.toLocaleString()} out</p>
                <p className="text-right font-medium">${Number(entry.estimated_cost_usd).toFixed(4)} · Unbilled</p>
              </div>
            ))}
            {(usage ?? []).length === 0 && <p className="p-5 text-sm text-icon-text-light">No owner AI usage yet.</p>}
          </div>
        </div>
      </div>
    );
  }
  const balances = await getCreditBalances(service, profile.id);
  const { data: entries } = await service
    .from("credit_ledger")
    .select("id, delta, reason, balance_bucket, note, created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Usage &amp; Credits</h1>
        <p className="mt-1 text-sm text-icon-text-light">Your customer-visible credit activity. Internal AI costs are never exposed here.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Available", balances.total],
            ["Trial", balances.trial],
            ["Monthly", balances.subscription],
            ["Rollover", balances.rollover],
            ["Manual", balances.manual],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-icon-border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">{label}</p><p className="mt-2 text-2xl font-semibold">{Number(value).toLocaleString()}</p></div>
          ))}
        </div>
        <div className="mt-7 overflow-x-auto rounded-xl border border-icon-border">
          <table className="w-full min-w-[680px] divide-y divide-icon-border text-sm">
            <thead className="bg-icon-primary-light text-left text-xs uppercase tracking-wide text-icon-text-light"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Bucket</th><th className="px-4 py-3">Note</th><th className="px-4 py-3 text-right">Credits</th></tr></thead>
            <tbody className="divide-y divide-icon-border">
              {(entries ?? []).map((entry) => (
                <tr key={entry.id}><td className="px-4 py-3 text-icon-text-light">{formatAccountDateTime(entry.created_at)}</td><td className="px-4 py-3 capitalize">{entry.reason.replaceAll("_", " ")}</td><td className="px-4 py-3 capitalize text-icon-text-light">{entry.balance_bucket ?? "legacy"}</td><td className="max-w-xs truncate px-4 py-3 text-icon-text-light">{entry.note ?? "—"}</td><td className={`px-4 py-3 text-right font-semibold ${entry.delta > 0 ? "text-emerald-700" : ""}`}>{entry.delta > 0 ? "+" : ""}{entry.delta}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
