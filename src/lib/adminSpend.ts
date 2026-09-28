if (typeof window !== "undefined") {
  throw new Error("src/lib/adminSpend.ts must not be imported from a Client Component module.");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CEILING_HIT_WINDOW_HOURS,
  evaluateMemberSpendFlags,
  type MemberSpendFlag,
} from "@/lib/adminSpendFlags";
import { getPlan } from "@/lib/plans";

export type { MemberSpendFlag };
export {
  CEILING_HIT_MIN_COUNT,
  CEILING_HIT_WINDOW_HOURS,
  DEFAULT_MARGIN_RISK_RATIO,
  evaluateMemberSpendFlags,
  marginRiskThresholdRatio,
} from "@/lib/adminSpendFlags";

export interface MemberSpendSummary {
  lifetimeSpendUsd: number;
  lifetimeActions: number;
  cycleSpendUsd: number;
  cycleActions: number;
  cycleWindowStart: string | null;
  cycleWindowEnd: string | null;
  paidRevenueUsd: number | null;
  marginRiskRatio: number | null;
  insufficientHits24h: number;
  flags: MemberSpendFlag[];
}

function paidRevenueForPlan(planId: string | null | undefined): number | null {
  if (!planId) return null;
  const plan = getPlan(planId);
  if (!plan) return null;
  // Annual subscribers are still scored against one month of list price so a
  // single hot month surfaces as margin risk.
  return plan.priceMonthly;
}

export async function loadMemberSpendSummaries(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, MemberSpendSummary>> {
  const empty = new Map<string, MemberSpendSummary>();
  if (profileIds.length === 0) return empty;

  const sinceCeiling = new Date(
    Date.now() - CEILING_HIT_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const [{ data: subscriptions }, { data: usageRows }, { data: insufficientRows }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          "profile_id, plan, status, billing_interval, current_period_start, current_period_end, created_at"
        )
        .in("profile_id", profileIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("ai_usage")
        .select("profile_id, estimated_cost_usd, created_at")
        .eq("usage_kind", "customer")
        .in("profile_id", profileIds),
      supabase
        .from("credit_operations")
        .select("profile_id")
        .eq("status", "insufficient")
        .in("profile_id", profileIds)
        .gte("created_at", sinceCeiling),
    ]);

  const latestSub = new Map<
    string,
    {
      plan: string;
      status: string;
      billing_interval: string | null;
      current_period_start: string | null;
      current_period_end: string | null;
    }
  >();
  for (const row of subscriptions ?? []) {
    if (!latestSub.has(row.profile_id)) latestSub.set(row.profile_id, row);
  }

  const insufficientCounts = new Map<string, number>();
  for (const row of insufficientRows ?? []) {
    insufficientCounts.set(row.profile_id, (insufficientCounts.get(row.profile_id) ?? 0) + 1);
  }

  const summaries = new Map<string, MemberSpendSummary>();
  for (const profileId of profileIds) {
    const sub = latestSub.get(profileId);
    const cycleStart =
      sub?.status === "active" || sub?.status === "past_due"
        ? sub.current_period_start
        : null;
    const cycleEnd =
      sub?.status === "active" || sub?.status === "past_due" ? sub.current_period_end : null;

    let lifetimeSpendUsd = 0;
    let lifetimeActions = 0;
    let cycleSpendUsd = 0;
    let cycleActions = 0;

    for (const row of usageRows ?? []) {
      if (row.profile_id !== profileId) continue;
      const cost = Number(row.estimated_cost_usd) || 0;
      lifetimeSpendUsd += cost;
      lifetimeActions += 1;
      if (cycleStart) {
        const created = new Date(row.created_at).getTime();
        const start = new Date(cycleStart).getTime();
        const end = cycleEnd ? new Date(cycleEnd).getTime() : Number.POSITIVE_INFINITY;
        if (created >= start && created < end) {
          cycleSpendUsd += cost;
          cycleActions += 1;
        }
      }
    }

    const paidRevenueUsd = paidRevenueForPlan(sub?.plan);
    const insufficientHits24h = insufficientCounts.get(profileId) ?? 0;
    const { marginRiskRatio, flags } = evaluateMemberSpendFlags({
      cycleSpendUsd,
      paidRevenueUsd,
      insufficientHits24h,
    });

    summaries.set(profileId, {
      lifetimeSpendUsd,
      lifetimeActions,
      cycleSpendUsd,
      cycleActions,
      cycleWindowStart: cycleStart,
      cycleWindowEnd: cycleEnd,
      paidRevenueUsd,
      marginRiskRatio,
      insufficientHits24h,
      flags,
    });
  }

  return summaries;
}
