"use client";

import { useState } from "react";
import {
  BillingIntervalToggle,
  ChoosePlanButton,
  ManageSubscriptionButton,
} from "@/components/BillingActions";
import {
  annualEffectiveMonthly,
  annualSavingsUsd,
  type BillingInterval,
  type PlanDefinition,
} from "@/lib/plans";

export function PlanDetailCheckout({
  plan,
  contentCta,
  isOwner,
  isCurrent,
  planIsLive,
  initialInterval = "month",
  annualConfigured,
}: {
  plan: PlanDefinition;
  contentCta: string;
  isOwner: boolean;
  isCurrent: boolean;
  planIsLive: boolean;
  initialInterval?: BillingInterval;
  annualConfigured: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>(
    annualConfigured ? initialInterval : "month"
  );

  if (isOwner) {
    return (
      <>
        <p className="text-sm font-semibold">Owner access</p>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Your owner account has unlimited usage and does not need a subscription.
        </p>
        <a href="/usage" className="premium-button mt-5 flex items-center justify-center bg-[#c79a45] text-[#041819]">
          View owner usage
        </a>
      </>
    );
  }

  if (isCurrent) {
    return (
      <>
        <p className="text-sm font-semibold">This is your current plan</p>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Change plan, switch monthly ↔ annual, or cancel in the Stripe billing portal.
        </p>
        <div className="mt-5">
          <ManageSubscriptionButton label="Manage billing" featured />
        </div>
      </>
    );
  }

  if (planIsLive) {
    return (
      <>
        <p className="text-sm font-semibold">Switch to {plan.name}</p>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Opens the Stripe portal so the change is prorated against your current subscription.
        </p>
        <div className="mt-5">
          <ManageSubscriptionButton label={`Switch to ${plan.name}`} featured />
        </div>
      </>
    );
  }

  return (
    <>
      <p className="text-sm font-semibold">Start with {plan.name}</p>
      {annualConfigured && (
        <div className="mt-4">
          <BillingIntervalToggle value={interval} onChange={setInterval} />
        </div>
      )}
      <p className="mt-3 text-sm leading-6 text-white/60">
        {interval === "year"
          ? `$${plan.priceAnnual.toLocaleString()}/year ($${annualEffectiveMonthly(plan)}/mo). Save $${annualSavingsUsd(plan).toLocaleString()} vs monthly. Credits still arrive each month.`
          : "Secure Stripe Checkout. Credits renew monthly — cancel anytime."}
      </p>
      <div className="mt-5">
        <ChoosePlanButton planId={plan.id} interval={interval} featured label={contentCta} />
      </div>
    </>
  );
}
