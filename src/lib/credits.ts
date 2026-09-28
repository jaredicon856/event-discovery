import type { SupabaseClient } from "@supabase/supabase-js";

/** Cost in credits of each metered action. Kept as constants so pricing changes are one-line edits. */
export const CREDIT_COSTS = {
  discovery: 20,
  enrichment: 20,
} as const;

/**
 * Balance is always the sum of the ledger, never a mutated counter — so it
 * can't drift out of sync or be double-spent by a race condition.
 */
export interface CreditBalances {
  trial: number;
  subscription: number;
  rollover: number;
  manual: number;
  total: number;
}

export interface UsageEntitlement {
  billingMode: "customer_credits" | "owner_unbilled";
  isOwnerUnlimited: boolean;
}

export function canStartDiscovery(nonTrialBalance: number, trialSearchesRemaining = 0): boolean {
  return trialSearchesRemaining > 0 || nonTrialBalance >= CREDIT_COSTS.discovery;
}

export function getNonTrialCreditBalance(
  balances: Pick<CreditBalances, "subscription" | "rollover" | "manual">
): number {
  return balances.subscription + balances.rollover + balances.manual;
}

export function canScheduleSearch(role: string, hasActivePaidPeriod: boolean): boolean {
  return role === "super_admin" || hasActivePaidPeriod;
}

export async function getUsageEntitlement(
  supabase: SupabaseClient,
  profileId: string
): Promise<UsageEntitlement> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, access_status")
    .eq("id", profileId)
    .single();
  if (error || !data || data.access_status !== "active") {
    throw new Error("Active profile not found");
  }
  const isOwnerUnlimited = data.role === "super_admin";
  return {
    isOwnerUnlimited,
    billingMode: isOwnerUnlimited ? "owner_unbilled" : "customer_credits",
  };
}

export async function getCreditBalances(
  supabase: SupabaseClient,
  profileId: string
): Promise<CreditBalances> {
  const [{ data, error }, { data: subscription }] = await Promise.all([
    supabase
      .from("credit_ledger")
      .select("delta, balance_bucket, expires_at")
      .eq("profile_id", profileId),
    supabase
      .from("subscriptions")
      .select("current_period_end")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const now = new Date();
  const paidPeriodActive =
    !subscription?.current_period_end || new Date(subscription.current_period_end) > now;
  const balances = { trial: 0, subscription: 0, rollover: 0, manual: 0 };
  for (const row of data ?? []) {
    const bucket = row.balance_bucket as keyof typeof balances | null;
    if (!bucket) continue;
    if (row.expires_at && new Date(row.expires_at) <= now) continue;
    if ((bucket === "subscription" || bucket === "rollover") && !paidPeriodActive) continue;
    balances[bucket] += row.delta;
  }
  return {
    ...balances,
    total: balances.trial + balances.subscription + balances.rollover + balances.manual,
  };
}

export async function getCreditBalance(supabase: SupabaseClient, profileId: string): Promise<number> {
  return (await getCreditBalances(supabase, profileId)).total;
}

export class InsufficientCreditsError extends Error {
  constructor(public balance: number, public required: number) {
    super(`Insufficient credits: have ${balance}, need ${required}`);
  }
}

/** Throws InsufficientCreditsError if the account can't afford `amount`; otherwise records the debit. */
export async function requireAndDebitCredits(
  supabase: SupabaseClient,
  params: {
    profileId: string;
    amount: number;
    reason: "discovery_usage" | "enrichment_usage";
    operationKey?: string;
    relatedEventId?: string;
    discoveryRunId?: string;
  }
): Promise<string> {
  const operationKey = params.operationKey ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc("debit_credits_v2", {
    p_profile_id: params.profileId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_operation_key: operationKey,
    p_related_event_id: params.relatedEventId ?? null,
    p_discovery_run_id: params.discoveryRunId ?? null,
  });
  if (error) throw new Error(error.message);
  const result = data as { status?: string; balance?: number };
  if (result.status === "insufficient") {
    throw new InsufficientCreditsError(result.balance ?? 0, params.amount);
  }
  if (!["charged", "completed"].includes(result.status ?? "")) {
    throw new Error(`Credit operation is ${result.status ?? "invalid"}`);
  }
  return operationKey;
}

export async function grantCredits(
  supabase: SupabaseClient,
  params: {
    profileId: string;
    amount: number;
    reason: "monthly_grant" | "topup" | "usage_refund" | "admin_adjustment";
    note?: string;
    createdBy?: string;
    relatedEventId?: string;
    bucket?: "subscription" | "rollover" | "manual";
    expiresAt?: string;
    stripeEventId?: string;
    stripeInvoiceId?: string;
  }
): Promise<void> {
  const { error } = await supabase.from("credit_ledger").insert({
    profile_id: params.profileId,
    delta: params.amount,
    reason: params.reason,
    note: params.note ?? null,
    created_by: params.createdBy ?? null,
    related_event_id: params.relatedEventId ?? null,
    balance_bucket:
      params.bucket ?? (params.reason === "monthly_grant" ? "subscription" : "manual"),
    expires_at: params.expiresAt ?? null,
    stripe_event_id: params.stripeEventId ?? null,
    stripe_invoice_id: params.stripeInvoiceId ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Refund an action that failed after its atomic debit completed. */
export async function refundUsageCredits(
  supabase: SupabaseClient,
  params: { operationKey: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc("refund_credit_operation", {
    p_operation_key: params.operationKey,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function completeCreditOperation(
  supabase: SupabaseClient,
  operationKey: string
): Promise<void> {
  const { error } = await supabase.rpc("complete_credit_operation", {
    p_operation_key: operationKey,
  });
  if (error) throw new Error(error.message);
}

/**
 * Monthly credits roll over while subscribed, capped at 2x the plan's monthly
 * allowance. Returns the number actually granted at this renewal.
 */
export async function grantCycleCredits(
  supabase: SupabaseClient,
  params: { profileId: string; allowance: number; note: string }
): Promise<number> {
  const balances = await getCreditBalances(supabase, params.profileId);
  const planBalance = balances.subscription + balances.rollover;
  const amount = Math.max(0, Math.min(params.allowance, params.allowance * 2 - planBalance));
  if (amount > 0) {
    await grantCredits(supabase, {
      profileId: params.profileId,
      amount,
      reason: "monthly_grant",
      note: params.note,
    });
  }
  return amount;
}
