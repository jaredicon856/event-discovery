import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PLANS,
  getStripeClient,
  getStripePriceId,
  type BillingInterval,
} from "@/lib/stripe";

const EXPECTED_MONTHLY_AMOUNTS: Record<string, number> = {
  starter: 7900,
  growth: 19900,
  scale: 49900,
};

const EXPECTED_ANNUAL_AMOUNTS: Record<string, number> = {
  starter: 79000,
  growth: 199000,
  scale: 499000,
};

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

/** Live Checkout is on only when STRIPE_ALLOW_LIVE_CHECKOUT is "true"; otherwise everything must be test mode. */
export function isLiveCheckout(): boolean {
  return process.env.STRIPE_ALLOW_LIVE_CHECKOUT === "true";
}

/** The key, and every Price, must match the chosen mode, so test and live can never mix. */
export function assertStripeSecretMatchesMode(secret = process.env.STRIPE_SECRET_KEY, live = isLiveCheckout()): void {
  if (!live) return assertStripeSecretIsTestMode(secret);
  if (!secret) throw new StripeConfigError("Missing STRIPE_SECRET_KEY");
  if (!/^(sk|rk)_live_/.test(secret)) {
    throw new StripeConfigError("STRIPE_ALLOW_LIVE_CHECKOUT is on, so STRIPE_SECRET_KEY must be a live sk_live_ key");
  }
}

export function assertStripeSecretIsTestMode(secret = process.env.STRIPE_SECRET_KEY): void {
  if (!secret) throw new StripeConfigError("Missing STRIPE_SECRET_KEY");
  if (secret.startsWith("sk_live_")) {
    throw new StripeConfigError("Live Stripe keys are not allowed for Checkout in this environment");
  }
  if (!secret.startsWith("sk_test_")) {
    throw new StripeConfigError("STRIPE_SECRET_KEY must be a test-mode sk_test_ key");
  }
}

async function assertRecurringPrice(params: {
  planName: string;
  priceId: string;
  amount: number;
  interval: BillingInterval;
}) {
  const stripe = getStripeClient();
  if (!params.priceId.startsWith("price_")) {
    throw new StripeConfigError(`${params.planName} price id is not a Stripe Price id`);
  }
  const price = await stripe.prices.retrieve(params.priceId);
  if (price.livemode !== isLiveCheckout()) {
    throw new StripeConfigError(
      `${params.planName} Price ${params.priceId} is ${price.livemode ? "live" : "test"}-mode; ${isLiveCheckout() ? "live" : "test"}-mode Price required`
    );
  }
  if (price.currency !== "usd") {
    throw new StripeConfigError(`${params.planName} Price must be usd`);
  }
  if (price.unit_amount !== params.amount) {
    throw new StripeConfigError(`${params.planName} Price amount must be ${params.amount}`);
  }
  if (price.recurring?.interval !== params.interval) {
    throw new StripeConfigError(`${params.planName} Price must recur ${params.interval}ly`);
  }
}

export async function assertTestModePrices(options?: { requireAnnual?: boolean }) {
  assertStripeSecretMatchesMode();
  for (const plan of PLANS) {
    await assertRecurringPrice({
      planName: `${plan.name} monthly`,
      priceId: getStripePriceId(plan, "month"),
      amount: EXPECTED_MONTHLY_AMOUNTS[plan.id],
      interval: "month",
    });
    const annualId = process.env[plan.stripeAnnualPriceEnvVar];
    if (annualId) {
      await assertRecurringPrice({
        planName: `${plan.name} annual`,
        priceId: annualId,
        amount: EXPECTED_ANNUAL_AMOUNTS[plan.id],
        interval: "year",
      });
    } else if (options?.requireAnnual) {
      throw new StripeConfigError(`Missing env var ${plan.stripeAnnualPriceEnvVar}`);
    }
  }
}

export async function assertLocalTestCheckoutEnabled(interval: BillingInterval = "month") {
  if (process.env.STRIPE_CHECKOUT_ENABLED !== "true") {
    throw new StripeConfigError("Checkout is disabled until local test configuration is complete");
  }
  await assertTestModePrices({ requireAnnual: interval === "year" });
}

/** Same gating as the subscription checkout route. Top-ups use inline amounts, so there are no Prices to verify. */
export async function assertLocalTopupCheckoutEnabled() {
  if (process.env.STRIPE_CHECKOUT_ENABLED !== "true") {
    throw new StripeConfigError("Checkout is disabled until local test configuration is complete");
  }
  assertStripeSecretMatchesMode();
}

/**
 * The member's Stripe customer in the current mode. A customer id saved while
 * testing doesn't exist in live mode (and vice versa), so a missing or deleted
 * one is replaced with a fresh customer.
 */
export async function ensureStripeCustomer(params: {
  stripe: ReturnType<typeof getStripeClient>;
  supabase: SupabaseClient;
  profileId: string;
  email: string | undefined;
  existingId: string | null | undefined;
}): Promise<string> {
  const { stripe, supabase, profileId, email, existingId } = params;
  if (existingId) {
    try {
      const found = await stripe.customers.retrieve(existingId);
      if (!("deleted" in found && found.deleted)) return existingId;
    } catch (error) {
      if ((error as { code?: string }).code !== "resource_missing") throw error;
    }
  }
  const customer = await stripe.customers.create({ email, metadata: { profile_id: profileId } });
  await supabase.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profileId);
  return customer.id;
}
