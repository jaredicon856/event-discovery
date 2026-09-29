import { CREDIT_COSTS } from "@/lib/credits";
import { PLANS } from "@/lib/plans";

export const TOPUP_MIN_USD = 20;
export const TOPUP_MAX_USD = 2000;
export const TOPUP_PRESETS_USD = [20, 50, 100] as const;

/**
 * Top-ups follow the monthly plans: paying a plan's price buys exactly that
 * plan's credits, amounts between two plans are interpolated, and amounts past
 * the largest plan continue at its rate. Derived from PLANS so the two can
 * never drift apart.
 */
const PRICE_POINTS = [
  { cents: 0, credits: 0 },
  ...[...PLANS]
    .sort((a, b) => a.priceMonthly - b.priceMonthly)
    .map((plan) => ({ cents: plan.priceMonthly * 100, credits: plan.creditsPerCycle })),
];

export interface TopupQuote {
  amountUsd: number;
  credits: number;
  actions: number;
}

/** Credits for an amount actually paid. Used by the webhook, so it trusts only the charge. */
export function creditsForAmountCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const cents = Math.floor(amountCents);
  const upperIndex = PRICE_POINTS.findIndex((point) => point.cents >= cents);
  if (upperIndex === -1) {
    const last = PRICE_POINTS[PRICE_POINTS.length - 1];
    return last.credits + Math.floor(((cents - last.cents) * last.credits) / last.cents);
  }
  const upper = PRICE_POINTS[upperIndex];
  if (upper.cents === cents) return upper.credits;
  const lower = PRICE_POINTS[upperIndex - 1];
  return (
    lower.credits +
    Math.floor(((cents - lower.cents) * (upper.credits - lower.credits)) / (upper.cents - lower.cents))
  );
}

export function isValidTopupAmount(amountUsd: unknown): amountUsd is number {
  return (
    typeof amountUsd === "number" &&
    Number.isInteger(amountUsd) &&
    amountUsd >= TOPUP_MIN_USD &&
    amountUsd <= TOPUP_MAX_USD
  );
}

export function quoteTopup(amountUsd: number): TopupQuote {
  const credits = creditsForAmountCents(Math.round(amountUsd * 100));
  return {
    amountUsd,
    credits,
    actions: Math.floor(credits / CREDIT_COSTS.discovery),
  };
}
