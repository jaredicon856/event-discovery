import { requireSuperAdmin } from "@/lib/access";
import { loadMemberSpendSummaries } from "@/lib/adminSpend";
import { AdminConsole } from "@/components/AdminConsole";
import { getCreditBalance } from "@/lib/credits";
import { FEATURE_FLAG_KEYS } from "@/lib/featureFlags";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const MEMBERS_PER_PAGE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile: actor, service: supabase } = await requireSuperAdmin();
  const params = await searchParams;
  const query = (one(params.q) ?? "").trim().slice(0, 100);
  const statusParam = one(params.status);
  const status = statusParam === "active" || statusParam === "suspended" || statusParam === "pending"
    ? statusParam
    : "all";
  const requestedPage = Number.parseInt(one(params.page) ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selectedMemberId = one(params.member);
  const from = (page - 1) * MEMBERS_PER_PAGE;

  let membersQuery = supabase
    .from("profiles")
    .select("id, email, display_name, full_name, role, access_status, created_at", { count: "exact" })
    .eq("is_test_account", false)
    .neq("role", "super_admin")
    .order("created_at", { ascending: false })
    .range(from, from + MEMBERS_PER_PAGE - 1);
  if (query) membersQuery = membersQuery.ilike("email", `%${query}%`);
  if (status !== "all") membersQuery = membersQuery.eq("access_status", status);

  const [
    { data: profiles, count: memberCount, error: membersError },
    { data: metricsData },
    { data: invitations },
    { data: audit },
    { data: recentRuns },
    { data: featureFlagRows },
  ] = await Promise.all([
    membersQuery,
    supabase.rpc("get_admin_dashboard_metrics"),
    supabase.from("invitations").select("id, email, status, expires_at").order("created_at", { ascending: false }).limit(25),
    supabase.from("admin_audit_log").select("id, action, reason, created_at, target_profile_id").order("created_at", { ascending: false }).limit(25),
    supabase
      .from("discovery_runs")
      .select("id, profile_id, query, sector, status, current_stage, events_found, contacts_found, estimated_cost_usd, created_at")
      .eq("run_kind", "customer")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("feature_flags").select("key, enabled, updated_at").eq("scope", "global"),
  ]);
  if (membersError) throw new Error(membersError.message);

  const profileIds = (profiles ?? []).map((profile) => profile.id);
  const runProfileIds = (recentRuns ?? [])
    .map((run) => run.profile_id)
    .filter((id): id is string => Boolean(id));
  const identityIds = [...new Set([...profileIds, ...runProfileIds])];
  const [{ data: subs }, { data: identities }, spendById] = await Promise.all([
    profileIds.length
      ? supabase
          .from("subscriptions")
          .select("profile_id, plan, status, billing_interval, current_period_start, current_period_end")
          .in("profile_id", profileIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    identityIds.length
      ? supabase.from("profiles").select("id, email, display_name, full_name").in("id", identityIds)
      : Promise.resolve({ data: [] }),
    loadMemberSpendSummaries(supabase, profileIds),
  ]);

  const balanceEntries = await Promise.all(
    (profiles ?? []).map(async (profile) => [
      profile.id,
      await getCreditBalance(supabase, profile.id),
    ] as const)
  );
  const balances = new Map(balanceEntries);
  const latestSub = new Map<string, { plan: string; status: string; billing_interval?: string }>();
  for (const row of subs ?? []) {
    if (!latestSub.has(row.profile_id)) {
      latestSub.set(row.profile_id, {
        plan: row.plan,
        status: row.status,
        billing_interval: row.billing_interval,
      });
    }
  }
  const identityById = new Map((identities ?? []).map((identity) => [identity.id, identity]));
  const metrics = (metricsData ?? {}) as {
    members_total?: number;
    members_active?: number;
    members_suspended?: number;
    runs_total?: number;
    runs_attention?: number;
    ai_actions?: number;
    ai_spend_usd?: number | string;
    ai_actions_month?: number;
    ai_spend_usd_month?: number | string;
    web_searches?: number;
  };
  const aiSpend = Number(metrics.ai_spend_usd ?? 0);
  const aiActions = Number(metrics.ai_actions ?? 0);
  const aiSpendMonth = Number(metrics.ai_spend_usd_month ?? 0);
  const aiActionsMonth = Number(metrics.ai_actions_month ?? 0);
  const avgActionCost = aiActions ? aiSpend / aiActions : 0;
  const totalPages = Math.max(1, Math.ceil((memberCount ?? 0) / MEMBERS_PER_PAGE));
  if (page > totalPages) {
    const nextParams = new URLSearchParams();
    if (query) nextParams.set("q", query);
    if (status !== "all") nextParams.set("status", status);
    nextParams.set("page", String(totalPages));
    redirect(`/admin?${nextParams.toString()}`);
  }

  let memberDetail = null;
  if (selectedMemberId) {
    const [{ data: detailProfile }, { data: detailRuns }, { data: operations }, { data: detailSubscription }, detailSpend] =
      await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, display_name, full_name, company, job_title, role, access_status, created_at")
        .eq("id", selectedMemberId)
        .eq("is_test_account", false)
        .neq("role", "super_admin")
        .maybeSingle(),
      supabase
        .from("discovery_runs")
        .select("id, query, status, events_found, contacts_found, credits_charged, credits_refunded, estimated_cost_usd, created_at")
        .eq("profile_id", selectedMemberId)
        .eq("run_kind", "customer")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("credit_operations")
        .select("id, action, amount, status, created_at")
        .eq("profile_id", selectedMemberId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("subscriptions")
        .select("plan, status, billing_interval")
        .eq("profile_id", selectedMemberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadMemberSpendSummaries(supabase, [selectedMemberId]),
    ]);
    if (detailProfile) {
      const spend = detailSpend.get(selectedMemberId) ?? null;
      memberDetail = {
        profile: detailProfile,
        runs: detailRuns ?? [],
        operations: operations ?? [],
        balance: await getCreditBalance(supabase, selectedMemberId),
        subscription: detailSubscription ?? null,
        spend,
      };
    }
  }

  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="animate-enter grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="premium-eyebrow">Owner command center</p>
            <h1 className="premium-title mt-3">Administration</h1>
            <p className="premium-subtitle mt-4">
              Control access, credits, roles, invitations, and customer research from one audited workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-icon-primary/20 bg-icon-primary-light px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-icon-primary">Customer base</p>
            <p className="mt-1 text-2xl font-semibold">{Number(metrics.members_total ?? 0).toLocaleString()}</p>
            <p className="text-xs text-icon-text-light">
              {Number(metrics.members_active ?? 0).toLocaleString()} active · {Number(metrics.members_suspended ?? 0).toLocaleString()} suspended
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="premium-card-dark p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">AI spend this month</p>
            <p className="mt-2 text-3xl font-semibold">${aiSpendMonth.toFixed(2)}</p>
            <p className="mt-2 text-xs text-white/50">
              {aiActionsMonth.toLocaleString()} actions · ${aiSpend.toFixed(2)} lifetime
            </p>
          </div>
          <div className={`premium-card p-5 ${avgActionCost > 0.4 ? "border-amber-400" : ""}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">Average action COGS</p>
            <p className="mt-2 text-3xl font-semibold">${avgActionCost.toFixed(3)}</p>
            <p className={`mt-2 text-xs ${avgActionCost > 0.4 ? "font-semibold text-amber-700" : "text-icon-text-light"}`}>$0.40 target{avgActionCost > 0.4 ? " exceeded" : ""}</p>
          </div>
          <div className="premium-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">Research runs</p>
            <p className="mt-2 text-3xl font-semibold">{Number(metrics.runs_total ?? 0).toLocaleString()}</p>
            <p className="mt-2 text-xs text-icon-text-light">{Number(metrics.runs_attention ?? 0).toLocaleString()} need attention</p>
          </div>
          <div className="premium-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">Web searches</p>
            <p className="mt-2 text-3xl font-semibold">{Number(metrics.web_searches ?? 0).toLocaleString()}</p>
            <p className="mt-2 text-xs text-icon-text-light">Provider requests recorded</p>
          </div>
        </div>

        <AdminConsole
          actorId={actor.id}
          members={(profiles ?? []).map((profile) => {
            const spend = spendById.get(profile.id);
            return {
              id: profile.id,
              email: profile.email,
              display_name: profile.display_name,
              full_name: profile.full_name,
              role: profile.role,
              access_status: profile.access_status,
              created_at: profile.created_at,
              balance: balances.get(profile.id) ?? 0,
              subscription: latestSub.get(profile.id) ?? null,
              spend: spend
                ? {
                    lifetimeSpendUsd: spend.lifetimeSpendUsd,
                    lifetimeActions: spend.lifetimeActions,
                    cycleSpendUsd: spend.cycleSpendUsd,
                    cycleActions: spend.cycleActions,
                    flags: spend.flags,
                    marginRiskRatio: spend.marginRiskRatio,
                  }
                : null,
            };
          })}
          memberPage={{
            page: Math.min(page, totalPages),
            totalPages,
            total: memberCount ?? 0,
            pageSize: MEMBERS_PER_PAGE,
            query,
            status,
          }}
          memberDetail={memberDetail}
          recentResearch={(recentRuns ?? []).map((run) => {
            const identity = run.profile_id ? identityById.get(run.profile_id) : null;
            return {
              ...run,
              member_email: identity?.email ?? "Deleted account",
              member_name: identity?.display_name || identity?.full_name || null,
            };
          })}
          invitations={invitations ?? []}
          audit={audit ?? []}
          featureFlags={FEATURE_FLAG_KEYS.map((key) => {
            const row = (featureFlagRows ?? []).find((flag) => flag.key === key);
            return { key, enabled: row?.enabled ?? true, updated_at: row?.updated_at ?? null };
          })}
        />
      </div>
    </div>
  );
}
