import {
  PLANS,
  TOPUP_PACKS,
  getStripeClient,
  getStripePriceId,
  getStripeTopupPriceId,
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

const EXPECTED_TOPUP_AMOUNTS: Record<string, number> = {
  small: 8900,
  medium: 20900,
  large: 39900,
};

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
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
  if (price.livemode) {
    throw new StripeConfigError(
      `${params.planName} Price ${params.priceId} is live-mode; test-mode Price required`
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
  assertStripeSecretIsTestMode();
  if (process.env.STRIPE_ALLOW_LIVE_CHECKOUT === "true") {
    throw new StripeConfigError("Live Checkout remains disabled");
  }
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
  if (process.env.STRIPE_ALLOW_LIVE_CHECKOUT === "true") {
    throw new StripeConfigError("Live Checkout remains disabled");
  }
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    throw new StripeConfigError("Live Checkout is locked");
  }
  await assertTestModePrices({ requireAnnual: interval === "year" });
}

export async function assertTestModeTopupPrices() {
  assertStripeSecretIsTestMode();
  if (process.env.STRIPE_ALLOW_LIVE_CHECKOUT === "true") {
    throw new StripeConfigError("Live Checkout remains disabled");
  }
  const stripe = getStripeClient();
  for (const pack of TOPUP_PACKS) {
    const priceId = getStripeTopupPriceId(pack);
    if (!priceId.startsWith("price_")) {
      throw new StripeConfigError(`${pack.stripePriceEnvVar} is not a Stripe Price id`);
    }
    const price = await stripe.prices.retrieve(priceId);
    if (price.livemode) {
      throw new StripeConfigError(`${pack.name} top-up Price ${priceId} is live-mode; test-mode Price required`);
    }
    if (price.currency !== "usd") {
      throw new StripeConfigError(`${pack.name} top-up Price must be usd`);
    }
    if (price.unit_amount !== EXPECTED_TOPUP_AMOUNTS[pack.id]) {
      throw new StripeConfigError(`${pack.name} top-up Price amount must be ${EXPECTED_TOPUP_AMOUNTS[pack.id]}`);
    }
    if (price.recurring) {
      throw new StripeConfigError(`${pack.name} top-up Price must be one-time, not recurring`);
    }
  }
}

/** Same gating as the subscription checkout route, applied to one-time top-up Prices. */
export async function assertLocalTopupCheckoutEnabled() {
  if (process.env.STRIPE_CHECKOUT_ENABLED !== "true") {
    throw new StripeConfigError("Checkout is disabled until local test configuration is complete");
  }
  if (process.env.STRIPE_ALLOW_LIVE_CHECKOUT === "true") {
    throw new StripeConfigError("Live Checkout remains disabled");
  }
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    throw new StripeConfigError("Live Checkout is locked");
  }
  await assertTestModeTopupPrices();
}
