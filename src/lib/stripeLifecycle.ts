import type { PlanDefinition } from "@/lib/plans";

export type PaidInvoiceDecision =
  | { kind: "cycle"; applyPlan: true; grantAmount: number }
  | { kind: "paid_upgrade"; applyPlan: true; grantAmount: number }
  | { kind: "pending_downgrade"; applyPlan: false; grantAmount: 0 }
  | { kind: "unpaid_upgrade"; applyPlan: false; grantAmount: 0 };

export function getCancellationState(params: {
  cancelAtPeriodEnd: boolean;
  cancelAt: number | null;
  periodEnd: string | null;
}): { scheduled: boolean; accessEndsAt: string | null } {
  if (params.cancelAt) {
    return {
      scheduled: true,
      accessEndsAt: new Date(params.cancelAt * 1000).toISOString(),
    };
  }
  return {
    scheduled: params.cancelAtPeriodEnd,
    accessEndsAt: params.cancelAtPeriodEnd ? params.periodEnd : null,
  };
}

export function decidePaidInvoice(params: {
  billingReason?: string;
  amountPaid: number;
  currentAllowance: number;
  candidatePlan: PlanDefinition;
}): PaidInvoiceDecision {
  if (params.billingReason !== "subscription_update") {
    return {
      kind: "cycle",
      applyPlan: true,
      grantAmount: params.candidatePlan.creditsPerCycle,
    };
  }

  const difference = params.candidatePlan.creditsPerCycle - params.currentAllowance;
  if (difference < 0) {
    return { kind: "pending_downgrade", applyPlan: false, grantAmount: 0 };
  }
  if (difference > 0 && params.amountPaid <= 0) {
    return { kind: "unpaid_upgrade", applyPlan: false, grantAmount: 0 };
  }
  return {
    kind: "paid_upgrade",
    applyPlan: true,
    grantAmount: Math.max(0, difference),
  };
}
