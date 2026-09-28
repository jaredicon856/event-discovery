if (typeof window !== "undefined") {
  throw new Error("src/lib/annualCredits.ts must not be imported from a Client Component module.");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { annualGrantKey } from "@/lib/annualCreditKeys";
import { getPlan } from "@/lib/plans";

/**
 * Annual subscribers pay once a year but still receive the same monthly
 * credit allowance. Stripe only fires invoice.paid yearly for those Prices,
 * so this job grants each subsequent month idempotently.
 *
 * Idempotency key: annual_cycle:{stripe_subscription_id}:{yyyy-mm}
 */
export async function grantDueAnnualMonthlyCredits(
  supabase: SupabaseClient,
  now = new Date()
): Promise<{ considered: number; granted: number }> {
  const { data: annualSubs, error } = await supabase
    .from("subscriptions")
    .select(
      "profile_id, plan, credits_per_cycle, stripe_subscription_id, current_period_start, current_period_end, status"
    )
    .eq("billing_interval", "year")
    .in("status", ["active", "past_due"]);
  if (error) throw new Error(error.message);

  let granted = 0;
  for (const sub of annualSubs ?? []) {
    if (!sub.stripe_subscription_id || !sub.current_period_start) continue;
    const periodStart = new Date(sub.current_period_start);
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    if (periodEnd && now >= periodEnd) continue;
    if (now < periodStart) continue;

    // Month index within the annual period (0 = invoice month, already granted).
    const monthsElapsed = monthsBetween(periodStart, now);
    if (monthsElapsed <= 0) continue;

    const cycleKey = annualGrantKey(
      sub.stripe_subscription_id,
      addMonths(periodStart, monthsElapsed)
    );
    const sliceEnd = periodEnd
      ? new Date(Math.min(addMonths(periodStart, monthsElapsed + 1).getTime(), periodEnd.getTime()))
      : addMonths(periodStart, monthsElapsed + 1);

    const plan = getPlan(sub.plan);
    const allowance = sub.credits_per_cycle || plan?.creditsPerCycle || 0;
    if (allowance <= 0) continue;

    const { error: grantError, data } = await supabase.rpc("grant_subscription_cycle", {
      p_profile_id: sub.profile_id,
      p_allowance: allowance,
      p_period_end: sliceEnd.toISOString(),
      p_stripe_event_id: cycleKey,
      p_stripe_invoice_id: cycleKey,
      p_note: `${plan?.name ?? sub.plan} annual plan — monthly credit grant`,
    });
    if (grantError) throw new Error(grantError.message);
    if (Number(data) > 0) granted += 1;
  }

  return { considered: annualSubs?.length ?? 0, granted };
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  );
}
