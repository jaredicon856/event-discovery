import assert from "node:assert/strict";
import { config } from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(
  description: string,
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeoutMs = 60_000
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    if (ready(value)) return value;
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
  if (process.env.RUN_STRIPE_GENERATED_LIFECYCLE !== "1") {
    console.log("Skipping Stripe-generated lifecycle verification.");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const starterPrice = process.env.STRIPE_PRICE_STARTER;
  const growthPrice = process.env.STRIPE_PRICE_GROWTH;
  if (!supabaseUrl || !serviceKey || !stripeKey || !starterPrice || !growthPrice) {
    throw new Error("Stripe-generated lifecycle environment is incomplete");
  }
  assert.match(stripeKey, /^sk_test_/, "Generated lifecycle verification must use Stripe test mode");

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const stripe = new Stripe(stripeKey);
  const suffix = Date.now();
  const email = `stripe-clock-${suffix}@example.com`;
  const password = `StripeClock-${suffix}!`;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Stripe Clock" },
  });
  if (createError || !created.user) throw createError ?? new Error("Test user was not created");
  const profileId = created.user.id;
  const { error: activationError } = await supabase.rpc("activate_public_account", {
    p_profile_id: profileId,
  });
  if (activationError) throw activationError;
  await supabase
    .from("profiles")
    .update({ full_name: "Stripe Clock", display_name: "Stripe", is_test_account: true })
    .eq("id", profileId);

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `Event Scout lifecycle ${suffix}`,
  });
  const customer = await stripe.customers.create({
    email,
    test_clock: clock.id,
    metadata: { profile_id: profileId, test_run: "stripe_generated_lifecycle" },
  });
  const successMethod = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(successMethod.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: successMethod.id },
  });

  let subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: starterPrice }],
    metadata: { profile_id: profileId, plan_id: "starter", test_run: "stripe_generated_lifecycle" },
    payment_behavior: "error_if_incomplete",
  });
  assert.equal(subscription.livemode, false);

  const initial = await waitFor(
    "initial Stripe-generated invoice grant",
    async () => {
      const [{ data: stored }, { count: grants }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("status, plan")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle(),
        supabase
          .from("credit_ledger")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .eq("reason", "monthly_grant"),
      ]);
      return { stored, grants: grants ?? 0 };
    },
    (value) => value.stored?.status === "active" && value.grants === 1
  );
  assert.deepEqual(initial.stored, { status: "active", plan: "starter" });

  const itemId = subscription.items.data[0]?.id;
  assert.ok(itemId);
  subscription = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: itemId, price: growthPrice }],
    proration_behavior: "always_invoice",
  });
  await waitFor(
    "Stripe-generated paid upgrade",
    async () => {
      const [{ data: stored }, { count: grants }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan, credits_per_cycle")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle(),
        supabase
          .from("credit_ledger")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .eq("reason", "upgrade_grant"),
      ]);
      return { stored, grants: grants ?? 0 };
    },
    (value) => value.stored?.plan === "growth" && value.grants === 1
  );

  subscription = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: itemId, price: starterPrice }],
    proration_behavior: "none",
  });
  await waitFor(
    "pending next-renewal downgrade",
    async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, pending_plan")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      return data;
    },
    (value) => value?.plan === "growth" && value.pending_plan === "starter"
  );

  const waitForClock = () =>
    waitFor(
      "Stripe test clock",
      () => stripe.testHelpers.testClocks.retrieve(clock.id),
      (value) => value.status === "ready"
    );

  const firstPeriodEnd = subscription.items.data[0]?.current_period_end;
  assert.ok(firstPeriodEnd);
  // Stripe creates the renewal invoice at the period boundary, then finalizes
  // and attempts it about an hour later. Advance through both scheduled stages.
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: firstPeriodEnd + 3_660 });
  await waitForClock();
  await waitFor(
    "Stripe-generated renewal grant",
    async () => {
      const [{ count }, { data: stored }] = await Promise.all([
        supabase
          .from("credit_ledger")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .eq("reason", "monthly_grant"),
        supabase
          .from("subscriptions")
          .select("plan, pending_plan")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle(),
      ]);
      return { grants: count ?? 0, stored };
    },
    (value) =>
      value.grants === 2 &&
      value.stored?.plan === "starter" &&
      value.stored.pending_plan === null
  );

  const failingMethod = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_chargeCustomerFail" },
  });
  await stripe.paymentMethods.attach(failingMethod.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: failingMethod.id },
  });
  subscription = await stripe.subscriptions.retrieve(subscription.id);
  const secondPeriodEnd = subscription.items.data[0]?.current_period_end;
  assert.ok(secondPeriodEnd);
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: secondPeriodEnd + 3_660 });
  await waitForClock();
  const failed = await waitFor(
    "Stripe-generated failed renewal",
    async () => {
      const [{ data: stored }, { count: grants }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("status")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle(),
        supabase
          .from("credit_ledger")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .eq("reason", "monthly_grant"),
      ]);
      return { status: stored?.status, grants: grants ?? 0 };
    },
    (value) => value.status === "past_due"
  );
  assert.equal(failed.grants, 2, "Failed renewal must not grant another allowance");

  subscription = await stripe.subscriptions.cancel(subscription.id);
  await waitFor(
    "Stripe-generated final cancellation",
    async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, cancel_at_period_end, access_ends_at")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      return data;
    },
    (value) =>
      value?.status === "canceled" &&
      value.cancel_at_period_end === false &&
      Boolean(value.access_ends_at)
  );

  console.log(JSON.stringify({
    status: "passed",
    evidenceKind: "stripe_generated_test_clock_events",
    identifiedTestRecords: {
      profileId,
      email,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripeTestClockId: clock.id,
    },
    verified: [
      "Stripe-generated initial invoice payment",
      "Stripe-generated paid upgrade",
      "Stripe-generated pending downgrade",
      "Stripe-generated monthly renewal",
      "Stripe-generated failed renewal with no credit grant",
      "Stripe-generated final cancellation",
    ],
    cleanupPerformed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
