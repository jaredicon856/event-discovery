import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan, type BillingInterval, type PlanDefinition } from "@/lib/plans";
import { listCustomerInvoices } from "@/lib/stripeInvoices";

export const NEW_ACCOUNT_DAYS = 14;
export const MONTHLY_ENDING_DAYS = 7;
export const TRIAL_LOW_DISCOVERY = 0;
export const TRIAL_LOW_CONTACTS = 1;
export const TRIAL_EXPIRING_DAYS = 2;

export type OwnerClientStatus =
  | "active_plan"
  | "trial"
  | "trial_ending"
  | "trial_complete"
  | "trial_expired"
  | "no_plan"
  | "past_due"
  | "canceled";

export interface OwnerClientRow {
  id: string;
  email: string;
  displayName: string | null;
  company: string | null;
  accessStatus: string;
  createdAt: string;
  planId: string | null;
  planName: string | null;
  planStatus: string | null;
  billingInterval: BillingInterval | null;
  cyclePriceUsd: number;
  monthlyEquivalentUsd: number;
  lifetimePaidUsd: number | null;
  periodEnd: string | null;
  trialDiscoveryRemaining: number | null;
  trialContactsRemaining: number | null;
  trialExpiresAt: string | null;
  aiSpendUsd: number;
  status: OwnerClientStatus;
  isNew: boolean;
  isAnnual: boolean;
  isMonthlyEnding: boolean;
  isTrialEnding: boolean;
}

export interface OwnerBillingSnapshot {
  clients: OwnerClientRow[];
  mrrUsd: number;
  arrUsd: number;
  aiSpendMonthUsd: number;
  aiSpendLifetimeUsd: number;
  estimatedMonthProfitUsd: number;
  marginPct: number | null;
  segments: {
    newAccounts: OwnerClientRow[];
    trialEnding: OwnerClientRow[];
    annual: OwnerClientRow[];
    monthlyEnding: OwnerClientRow[];
  };
  activePlanCounts: Record<string, number>;
}

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  company: string | null;
  access_status: string;
  created_at: string;
  stripe_customer_id: string | null;
};

type SubscriptionRow = {
  profile_id: string;
  plan: string;
  status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  created_at: string;
};

type TrialRow = {
  profile_id: string;
  discovery_remaining: number;
  contact_lookups_remaining: number;
  expires_at: string | null;
};

type UsageRow = {
  profile_id: string;
  estimated_cost_usd: number | string;
  created_at: string;
};

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms / (1000 * 60 * 60 * 24);
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export function cyclePriceForPlan(
  plan: PlanDefinition | undefined,
  interval: BillingInterval | null
): number {
  if (!plan) return 0;
  return interval === "year" ? plan.priceAnnual : plan.priceMonthly;
}

export function monthlyEquivalentForPlan(
  plan: PlanDefinition | undefined,
  interval: BillingInterval | null
): number {
  if (!plan) return 0;
  if (interval === "year") return Math.round((plan.priceAnnual / 12) * 100) / 100;
  return plan.priceMonthly;
}

export function classifyOwnerClient(input: {
  createdAt: string;
  planId: string | null;
  planStatus: string | null;
  billingInterval: BillingInterval | null;
  periodEnd: string | null;
  trialDiscoveryRemaining: number | null;
  trialContactsRemaining: number | null;
  trialExpiresAt?: string | null;
  now?: Date;
}): Pick<
  OwnerClientRow,
  "status" | "isNew" | "isAnnual" | "isMonthlyEnding" | "isTrialEnding"
> {
  const hasTrial =
    input.trialDiscoveryRemaining != null || input.trialContactsRemaining != null;
  const trialDaysLeft = daysFromNow(input.trialExpiresAt);
  const trialExpired = trialDaysLeft != null && trialDaysLeft <= 0;
  const discovery = trialExpired ? 0 : input.trialDiscoveryRemaining ?? 0;
  const contacts = trialExpired ? 0 : input.trialContactsRemaining ?? 0;
  const trialRemaining = discovery + contacts;
  const paidLive = Boolean(
    input.planId && input.planStatus && ["active", "past_due"].includes(input.planStatus)
  );

  let status: OwnerClientStatus = "no_plan";
  if (paidLive && input.planStatus === "past_due") status = "past_due";
  else if (paidLive) status = "active_plan";
  else if (input.planStatus === "canceled") status = "canceled";
  else if (hasTrial && trialExpired) status = "trial_expired";
  else if (hasTrial && trialRemaining <= 0) status = "trial_complete";
  else if (hasTrial) status = "trial";

  const isTrialEnding =
    !paidLive &&
    hasTrial &&
    trialRemaining > 0 &&
    (discovery <= TRIAL_LOW_DISCOVERY ||
      contacts <= TRIAL_LOW_CONTACTS ||
      (trialDaysLeft != null && trialDaysLeft <= TRIAL_EXPIRING_DAYS));

  if (isTrialEnding) status = "trial_ending";

  const isAnnual = paidLive && input.billingInterval === "year";
  const daysLeft = daysFromNow(input.periodEnd);
  const isMonthlyEnding =
    paidLive &&
    input.billingInterval !== "year" &&
    daysLeft != null &&
    daysLeft >= 0 &&
    daysLeft <= MONTHLY_ENDING_DAYS;

  return {
    status,
    isNew: daysSince(input.createdAt) <= NEW_ACCOUNT_DAYS,
    isAnnual,
    isMonthlyEnding,
    isTrialEnding,
  };
}

async function loadLifetimePaidUsd(
  stripeCustomerId: string | null
): Promise<number | null> {
  if (!stripeCustomerId) return 0;
  try {
    const invoices = await listCustomerInvoices(stripeCustomerId, 100);
    const cents = invoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.amountCents, 0);
    return Math.round(cents) / 100;
  } catch {
    return null;
  }
}

export async function loadOwnerBillingSnapshot(
  supabase: SupabaseClient
): Promise<OwnerBillingSnapshot> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const [{ data: profiles, error: profilesError }, { data: subscriptions }, { data: trials }, { data: usage }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, display_name, full_name, company, access_status, created_at, stripe_customer_id"
        )
        .eq("is_test_account", false)
        .neq("role", "super_admin")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("profile_id, plan, status, billing_interval, current_period_end, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("trial_entitlements")
        .select("profile_id, discovery_remaining, contact_lookups_remaining, expires_at"),
      supabase
        .from("ai_usage")
        .select("profile_id, estimated_cost_usd, created_at")
        .eq("usage_kind", "customer"),
    ]);

  if (profilesError) throw new Error(profilesError.message);

  const latestSub = new Map<string, SubscriptionRow>();
  for (const row of (subscriptions ?? []) as SubscriptionRow[]) {
    if (!latestSub.has(row.profile_id)) latestSub.set(row.profile_id, row);
  }
  const trialById = new Map(
    ((trials ?? []) as TrialRow[]).map((row) => [row.profile_id, row] as const)
  );

  const spendLifetime = new Map<string, number>();
  const spendMonth = new Map<string, number>();
  let aiSpendLifetimeUsd = 0;
  let aiSpendMonthUsd = 0;
  for (const row of (usage ?? []) as UsageRow[]) {
    const amount = Number(row.estimated_cost_usd) || 0;
    spendLifetime.set(row.profile_id, (spendLifetime.get(row.profile_id) ?? 0) + amount);
    aiSpendLifetimeUsd += amount;
    if (row.created_at >= monthStartIso) {
      spendMonth.set(row.profile_id, (spendMonth.get(row.profile_id) ?? 0) + amount);
      aiSpendMonthUsd += amount;
    }
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  const paidAmounts = await Promise.all(
    profileRows.map((profile) => loadLifetimePaidUsd(profile.stripe_customer_id))
  );

  const clients: OwnerClientRow[] = profileRows.map((profile, index) => {
    const sub = latestSub.get(profile.id);
    const trial = trialById.get(profile.id);
    const plan = sub ? getPlan(sub.plan) : undefined;
    const interval =
      sub?.billing_interval === "year" ? ("year" as const) : sub ? ("month" as const) : null;
    const paidLive = Boolean(sub && ["active", "past_due"].includes(sub.status));
    const flags = classifyOwnerClient({
      createdAt: profile.created_at,
      planId: paidLive ? sub?.plan ?? null : null,
      planStatus: sub?.status ?? null,
      billingInterval: interval,
      periodEnd: sub?.current_period_end ?? null,
      trialDiscoveryRemaining: trial?.discovery_remaining ?? null,
      trialContactsRemaining: trial?.contact_lookups_remaining ?? null,
      trialExpiresAt: trial?.expires_at ?? null,
    });

    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name || profile.full_name,
      company: profile.company,
      accessStatus: profile.access_status,
      createdAt: profile.created_at,
      planId: paidLive ? sub?.plan ?? null : null,
      planName: paidLive ? plan?.name ?? sub?.plan ?? null : null,
      planStatus: sub?.status ?? null,
      billingInterval: paidLive ? interval : null,
      cyclePriceUsd: paidLive ? cyclePriceForPlan(plan, interval) : 0,
      monthlyEquivalentUsd: paidLive ? monthlyEquivalentForPlan(plan, interval) : 0,
      lifetimePaidUsd: paidAmounts[index],
      periodEnd: sub?.current_period_end ?? null,
      trialDiscoveryRemaining: trial?.discovery_remaining ?? null,
      trialContactsRemaining: trial?.contact_lookups_remaining ?? null,
      trialExpiresAt: trial?.expires_at ?? null,
      aiSpendUsd: spendLifetime.get(profile.id) ?? 0,
      ...flags,
    };
  });

  const mrrUsd = clients.reduce((sum, client) => sum + client.monthlyEquivalentUsd, 0);
  const arrUsd = Math.round(mrrUsd * 12 * 100) / 100;
  const estimatedMonthProfitUsd = Math.round((mrrUsd - aiSpendMonthUsd) * 100) / 100;
  const marginPct = mrrUsd > 0 ? Math.round(((mrrUsd - aiSpendMonthUsd) / mrrUsd) * 1000) / 10 : null;

  const activePlanCounts: Record<string, number> = {};
  for (const client of clients) {
    if (!client.planId || client.status === "past_due") continue;
    if (client.status !== "active_plan") continue;
    activePlanCounts[client.planId] = (activePlanCounts[client.planId] ?? 0) + 1;
  }

  return {
    clients,
    mrrUsd: Math.round(mrrUsd * 100) / 100,
    arrUsd,
    aiSpendMonthUsd: Math.round(aiSpendMonthUsd * 100) / 100,
    aiSpendLifetimeUsd: Math.round(aiSpendLifetimeUsd * 100) / 100,
    estimatedMonthProfitUsd,
    marginPct,
    segments: {
      newAccounts: clients.filter((client) => client.isNew),
      trialEnding: clients.filter((client) => client.isTrialEnding),
      annual: clients.filter((client) => client.isAnnual),
      monthlyEnding: clients.filter((client) => client.isMonthlyEnding),
    },
    activePlanCounts,
  };
}

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ownerClientStatusLabel(status: OwnerClientStatus): string {
  switch (status) {
    case "active_plan":
      return "Active plan";
    case "trial":
      return "Trial";
    case "trial_ending":
      return "Trial ending";
    case "trial_complete":
      return "Trial complete";
    case "trial_expired":
      return "Trial expired";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    default:
      return "No plan";
  }
}
