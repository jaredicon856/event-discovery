import Stripe from "stripe";
import {
  PLANS,
  getPlan,
  type BillingInterval,
  type PlanDefinition,
} from "@/lib/plans";

export {
  PLANS,
  getPlan,
  annualSavingsUsd,
  annualEffectiveMonthly,
  type BillingInterval,
  type PlanDefinition,
} from "@/lib/plans";

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export function getStripePriceId(plan: PlanDefinition, interval: BillingInterval = "month"): string {
  const envVar = interval === "year" ? plan.stripeAnnualPriceEnvVar : plan.stripePriceEnvVar;
  const priceId = process.env[envVar];
  if (!priceId) throw new Error(`Missing env var ${envVar} — create the Price in Stripe first`);
  return priceId;
}

export function getPlanByStripePriceId(priceId: string): PlanDefinition | undefined {
  return PLANS.find(
    (plan) =>
      process.env[plan.stripePriceEnvVar] === priceId ||
      process.env[plan.stripeAnnualPriceEnvVar] === priceId
  );
}

export function getBillingIntervalForStripePriceId(priceId: string): BillingInterval {
  for (const plan of PLANS) {
    if (process.env[plan.stripeAnnualPriceEnvVar] === priceId) return "year";
    if (process.env[plan.stripePriceEnvVar] === priceId) return "month";
  }
  return "month";
}

export function areAnnualPlansConfigured(): boolean {
  return PLANS.every((plan) => Boolean(process.env[plan.stripeAnnualPriceEnvVar]));
}
