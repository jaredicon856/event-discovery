"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BillingIntervalToggle,
  ChoosePlanButton,
  ManageSubscriptionButton,
  PlanPriceLabel,
} from "@/components/BillingActions";
import { PLAN_CONTENT, PLAN_FEATURES } from "@/lib/planContent";
import { CREDIT_COSTS } from "@/lib/credits";
import { PLANS, type BillingInterval } from "@/lib/plans";

export function BillingPlansGrid({
  planIsLive,
  activePlanId,
  activeInterval,
  annualConfigured,
}: {
  planIsLive: boolean;
  activePlanId?: string;
  activeInterval?: BillingInterval;
  annualConfigured: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <section id="plans" className="scroll-mt-8 pt-4">
      <div className="mb-7 text-center">
        <p className="premium-eyebrow">Simple capacity plans</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em]">Full access at every level</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-icon-text-light">
          Plans differ only by research capacity. Twenty credits runs one discovery or one contact
          lookup. Credits roll over up to twice your monthly allowance — even on annual billing.
        </p>
        {annualConfigured && (
          <div className="mt-5 flex justify-center">
            <BillingIntervalToggle value={interval} onChange={setInterval} />
          </div>
        )}
      </div>
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {PLANS.map((tier) => {
          const isCurrentPlan = activePlanId === tier.id && planIsLive;
          const isCurrentCadence = (activeInterval ?? "month") === interval;
          const isExactCurrent = isCurrentPlan && isCurrentCadence;
          const isPopular = tier.id === "growth";
          const discoveryActions = Math.floor(tier.creditsPerCycle / CREDIT_COSTS.discovery);
          const guidedSearches = Math.floor(
            tier.creditsPerCycle / (CREDIT_COSTS.discovery + 7 * CREDIT_COSTS.enrichment)
          );

          let action: React.ReactNode;
          if (isExactCurrent) {
            action = (
              <p className="flex min-h-11 items-center justify-center rounded-full border border-icon-primary text-sm font-semibold text-icon-primary">
                Your current plan
              </p>
            );
          } else if (planIsLive) {
            const label = isCurrentPlan
              ? interval === "year"
                ? "Switch to annual billing"
                : "Switch to monthly billing"
              : `Switch to ${tier.name}`;
            action = (
              <div className="relative z-10">
                <ManageSubscriptionButton label={label} featured={isPopular} />
              </div>
            );
          } else {
            action = (
              <div className="relative z-10">
                <ChoosePlanButton
                  planId={tier.id}
                  interval={interval}
                  featured={isPopular}
                  label={PLAN_CONTENT[tier.id].cta}
                />
              </div>
            );
          }

          return (
            <div
              key={tier.id}
              className={`reveal-card relative flex min-h-[31rem] flex-col overflow-hidden rounded-[1.35rem] border p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--icon-shadow)] ${
                isPopular
                  ? "border-icon-primary bg-[#112d2d] text-white"
                  : isExactCurrent
                    ? "border-icon-primary bg-icon-primary-light"
                    : "border-icon-border bg-icon-surface"
              }`}
              style={
                {
                  "--reveal-index": tier.id === "starter" ? 0 : tier.id === "growth" ? 1 : 2,
                } as React.CSSProperties
              }
            >
              {(isPopular || isExactCurrent) && (
                <span
                  className={`absolute right-5 top-5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${
                    isPopular ? "bg-[#d4ad62] text-[#071d1e]" : "bg-icon-primary text-white"
                  }`}
                >
                  {isExactCurrent ? "Current plan" : "Most popular"}
                </span>
              )}
              <p className={`text-sm font-semibold ${isPopular ? "text-[#d4ad62]" : "text-icon-primary"}`}>
                {tier.name}
              </p>
              <PlanPriceLabel plan={tier} interval={interval} popular={isPopular} />
              <p className={`mt-3 min-h-12 text-sm leading-6 ${isPopular ? "text-white/65" : "text-icon-text-light"}`}>
                {PLAN_CONTENT[tier.id].audience}
              </p>
              <div className={`mt-5 rounded-2xl p-4 ${isPopular ? "bg-white/[.07]" : "bg-icon-background"}`}>
                <p className="text-2xl font-semibold">{tier.creditsPerCycle.toLocaleString()}</p>
                <p className={`mt-1 text-xs ${isPopular ? "text-white/55" : "text-icon-text-light"}`}>
                  credits every month
                </p>
                <div
                  className={`mt-4 grid grid-cols-2 gap-3 border-t pt-4 ${
                    isPopular ? "border-white/10" : "border-icon-border"
                  }`}
                >
                  <div>
                    <strong className="block text-lg">{discoveryActions}</strong>
                    <span className={`text-[11px] ${isPopular ? "text-white/55" : "text-icon-text-light"}`}>
                      AI actions
                    </span>
                  </div>
                  <div>
                    <strong className="block text-lg">~{guidedSearches}</strong>
                    <span className={`text-[11px] ${isPopular ? "text-white/55" : "text-icon-text-light"}`}>
                      7-contact searches
                    </span>
                  </div>
                </div>
              </div>
              <ul className={`mt-6 grid gap-3 text-sm ${isPopular ? "text-white/75" : "text-icon-text-light"}`}>
                {PLAN_FEATURES.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className={`mt-0.5 h-4 w-4 shrink-0 ${isPopular ? "text-[#d4ad62]" : "text-icon-primary"}`}
                      fill="none"
                    >
                      <path
                        d="m4 10 4 4 8-8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {action}
                <Link
                  href={`/billing/plans/${tier.id}?interval=${interval}`}
                  className={`mt-3 block text-center text-xs underline-offset-4 hover:underline after:absolute after:inset-0 after:content-[''] ${
                    isPopular ? "text-white/55" : "text-icon-text-light"
                  }`}
                >
                  View full plan details
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      {planIsLive && (
        <p className="mt-3 text-xs text-icon-text-light">
          Plan and billing-period changes open the Stripe portal so upgrades, downgrades, and
          monthly ↔ annual switches are prorated correctly.
        </p>
      )}
      <p className="mt-6 text-center text-xs leading-5 text-icon-text-light">
        {interval === "year"
          ? "Annual prepay covers 12 months at 10× the monthly price. Credits still arrive monthly."
          : "Secure test-mode Checkout is active locally. Cancel anytime — no automatic top-ups."}
      </p>
    </section>
  );
}
