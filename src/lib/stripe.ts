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

export interface TopupPackDefinition {
  id: "small" | "medium" | "large";
  name: string;
  priceUsd: number;
  credits: number;
  stripePriceEnvVar: string;
}

export const TOPUP_PACKS: TopupPackDefinition[] = [
  {
    id: "small",
    name: "Small pack",
    priceUsd: 89,
    credits: 1000,
    stripePriceEnvVar: "STRIPE_PRICE_TOPUP_SMALL",
  },
  {
    id: "medium",
    name: "Medium pack",
    priceUsd: 209,
    credits: 2500,
    stripePriceEnvVar: "STRIPE_PRICE_TOPUP_MEDIUM",
  },
  {
    id: "large",
    name: "Large pack",
    priceUsd: 399,
    credits: 5000,
    stripePriceEnvVar: "STRIPE_PRICE_TOPUP_LARGE",
  },
];

export function getTopupPack(id: string): TopupPackDefinition | undefined {
  return TOPUP_PACKS.find((p) => p.id === id);
}

export function getStripeTopupPriceId(pack: TopupPackDefinition): string {
  const priceId = process.env[pack.stripePriceEnvVar];
  if (!priceId) throw new Error(`Missing env var ${pack.stripePriceEnvVar} — create the Price in Stripe first`);
  return priceId;
}

export function getTopupPackByStripePriceId(priceId: string): TopupPackDefinition | undefined {
  return TOPUP_PACKS.find((pack) => process.env[pack.stripePriceEnvVar] === priceId);
}

export function areTopupPacksConfigured(): boolean {
  return TOPUP_PACKS.every((pack) => Boolean(process.env[pack.stripePriceEnvVar]));
}
