export type BillingInterval = "month" | "year";

export interface PlanDefinition {
  id: "starter" | "growth" | "scale";
  name: string;
  priceMonthly: number;
  /**
   * Annual prepay at 10× monthly (~16.7% off / two months free).
   * Credits still grant monthly — see annualCredits cron.
   */
  priceAnnual: number;
  /** Monthly research allowance — same for monthly and annual billing. */
  creditsPerCycle: number;
  stripePriceEnvVar: string;
  stripeAnnualPriceEnvVar: string;
}

/**
 * Launch pricing model (September 2026).
 * Annual = 10 × monthly (pay for 10, get 12). Credits grant monthly on both cadences.
 */
export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 79,
    priceAnnual: 790,
    creditsPerCycle: 1000,
    stripePriceEnvVar: "STRIPE_PRICE_STARTER",
    stripeAnnualPriceEnvVar: "STRIPE_PRICE_STARTER_ANNUAL",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 199,
    priceAnnual: 1990,
    creditsPerCycle: 2500,
    stripePriceEnvVar: "STRIPE_PRICE_GROWTH",
    stripeAnnualPriceEnvVar: "STRIPE_PRICE_GROWTH_ANNUAL",
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 499,
    priceAnnual: 4990,
    creditsPerCycle: 6500,
    stripePriceEnvVar: "STRIPE_PRICE_SCALE",
    stripeAnnualPriceEnvVar: "STRIPE_PRICE_SCALE_ANNUAL",
  },
];

export function getPlan(id: string): PlanDefinition | undefined {
  return PLANS.find((p) => p.id === id);
}

export function annualSavingsUsd(plan: PlanDefinition): number {
  return plan.priceMonthly * 12 - plan.priceAnnual;
}

export function annualEffectiveMonthly(plan: PlanDefinition): number {
  return Math.round((plan.priceAnnual / 12) * 100) / 100;
}
