import assert from "node:assert/strict";
import { config } from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith("http://localhost")
  ? process.env.NEXT_PUBLIC_APP_URL
  : "http://localhost:3000";

async function main() {
  if (process.env.RUN_STRIPE_LIFECYCLE !== "1") {
    console.log("Skipping Stripe lifecycle verification (set RUN_STRIPE_LIFECYCLE=1).");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const starterPrice = process.env.STRIPE_PRICE_STARTER;
  const growthPrice = process.env.STRIPE_PRICE_GROWTH;
  if (!supabaseUrl || !serviceKey || !stripeKey || !webhookSecret || !starterPrice || !growthPrice) {
    throw new Error("Stripe lifecycle environment is incomplete");
  }
  assert.match(stripeKey, /^sk_test_/, "Lifecycle verification must use Stripe test mode");
  const signingSecret = webhookSecret;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const stripe = new Stripe(stripeKey);
  const suffix = Date.now();
  const email = `stripe-lifecycle-${suffix}@example.com`;
  const password = `StripeLifecycle-${suffix}!`;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("Test user was not created");
  const profileId = created.user.id;
  const { error: activationError } = await supabase.rpc("activate_public_account", {
    p_profile_id: profileId,
  });
  if (activationError) throw activationError;

  const customer = await stripe.customers.create({
    email,
    metadata: { profile_id: profileId, test_run: "stripe_lifecycle" },
  });
  const paymentMethod = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });
  let subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: starterPrice }],
    metadata: { profile_id: profileId, plan_id: "starter", test_run: "stripe_lifecycle" },
    payment_behavior: "error_if_incomplete",
  });
  assert.equal(subscription.livemode, false);

  let eventNumber = 0;
  // Handler-level acceptance helper. These payloads are constructed and signed
  // locally; they are not evidence that Stripe generated or delivered an event.
  async function sendSimulatedWebhook(type: string, object: Record<string, unknown>, eventId?: string) {
    const id = eventId ?? `evt_local_lifecycle_${suffix}_${++eventNumber}`;
    const payload = JSON.stringify({
      id,
      object: "event",
      api_version: "2026-03-25.dahlia",
      created: Math.floor(Date.now() / 1000),
      data: { object },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type,
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: signingSecret,
    });
    const response = await fetch(`${appUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });
    const result = (await response.json()) as { received?: boolean; duplicate?: boolean; error?: string };
    if (!response.ok) throw new Error(`${type} failed: ${result.error ?? response.status}`);
    return { id, result };
  }

  function invoiceObject(id: string, billingReason: string, amountPaid: number) {
    return {
      id,
      object: "invoice",
      amount_paid: amountPaid,
      billing_reason: billingReason,
      parent: { subscription_details: { subscription: subscription.id } },
    };
  }

  await sendSimulatedWebhook("checkout.session.completed", {
    id: `cs_local_lifecycle_${suffix}`,
    object: "checkout.session",
    mode: "subscription",
    payment_status: "paid",
    subscription: subscription.id,
    customer: customer.id,
    metadata: { profile_id: profileId, plan_id: "starter" },
  });
  const signupInvoice = invoiceObject(`in_local_signup_${suffix}`, "subscription_create", 79_00);
  const signupEvent = await sendSimulatedWebhook("invoice.paid", signupInvoice);
  const duplicate = await sendSimulatedWebhook("invoice.paid", signupInvoice, signupEvent.id);
  assert.equal(duplicate.result.duplicate, true);

  const topupEvent = await sendSimulatedWebhook("checkout.session.completed", {
    id: `cs_local_topup_${suffix}`,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 50_00,
    currency: "usd",
    customer: customer.id,
    metadata: {
      kind: "credit_topup",
      profile_id: profileId,
      amount_usd: "50",
    },
  });
  const duplicateTopup = await sendSimulatedWebhook(
    "checkout.session.completed",
    {
      id: `cs_local_topup_${suffix}`,
      object: "checkout.session",
      mode: "payment",
      payment_status: "paid",
      amount_total: 50_00,
      currency: "usd",
      customer: customer.id,
      metadata: {
        kind: "credit_topup",
        profile_id: profileId,
        amount_usd: "50",
      },
    },
    topupEvent.id
  );
  assert.equal(duplicateTopup.result.duplicate, true);

  const itemId = subscription.items.data[0]?.id;
  assert.ok(itemId);
  subscription = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: itemId, price: growthPrice }],
    proration_behavior: "none",
  });
  await sendSimulatedWebhook("customer.subscription.updated", subscription as unknown as Record<string, unknown>);
  await sendSimulatedWebhook(
    "invoice.paid",
    invoiceObject(`in_local_upgrade_${suffix}`, "subscription_update", 120_00)
  );

  subscription = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: itemId, price: starterPrice }],
    proration_behavior: "none",
  });
  await sendSimulatedWebhook("customer.subscription.updated", subscription as unknown as Record<string, unknown>);
  const { data: pendingDowngrade } = await supabase
    .from("subscriptions")
    .select("plan, pending_plan")
    .eq("stripe_subscription_id", subscription.id)
    .single();
  assert.deepEqual(pendingDowngrade, { plan: "growth", pending_plan: "starter" });

  const renewalInvoice = invoiceObject(`in_local_renewal_${suffix}`, "subscription_cycle", 79_00);
  const renewalEvent = await sendSimulatedWebhook("invoice.paid", renewalInvoice);
  await sendSimulatedWebhook("invoice.paid", renewalInvoice, renewalEvent.id);
  const { data: renewed } = await supabase
    .from("subscriptions")
    .select("plan, pending_plan")
    .eq("stripe_subscription_id", subscription.id)
    .single();
  assert.deepEqual(renewed, { plan: "starter", pending_plan: null });

  const { count: grantsBeforeFailure } = await supabase
    .from("credit_ledger")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .in("reason", ["monthly_grant", "upgrade_grant"]);
  await sendSimulatedWebhook(
    "invoice.payment_failed",
    invoiceObject(`in_local_failed_${suffix}`, "subscription_cycle", 0)
  );
  const [{ data: failedSubscription }, { count: grantsAfterFailure }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", subscription.id)
      .single(),
    supabase
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .in("reason", ["monthly_grant", "upgrade_grant"]),
  ]);
  assert.equal(failedSubscription?.status, "past_due");
  assert.equal(grantsAfterFailure, grantsBeforeFailure);

  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${appUrl}/billing`,
  });
  assert.match(portal.url, /^https:\/\/billing\.stripe\.com\//);

  subscription = await stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
  });
  await sendSimulatedWebhook("customer.subscription.updated", subscription as unknown as Record<string, unknown>);
  const { data: scheduledCancellation } = await supabase
    .from("subscriptions")
    .select("cancel_at_period_end, access_ends_at")
    .eq("stripe_subscription_id", subscription.id)
    .single();
  assert.equal(scheduledCancellation?.cancel_at_period_end, true);
  assert.ok(scheduledCancellation?.access_ends_at);

  subscription = await stripe.subscriptions.cancel(subscription.id);
  await sendSimulatedWebhook("customer.subscription.deleted", subscription as unknown as Record<string, unknown>);
  const { data: canceled } = await supabase
    .from("subscriptions")
    .select("status, cancel_at_period_end, access_ends_at")
    .eq("stripe_subscription_id", subscription.id)
    .single();
  assert.equal(canceled?.status, "canceled");
  assert.equal(canceled?.cancel_at_period_end, false);
  assert.ok(canceled?.access_ends_at);

  const [{ count: monthlyGrants }, { count: upgradeGrants }, { count: topups }, { data: profile }] =
    await Promise.all([
      supabase.from("credit_ledger").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("reason", "monthly_grant"),
      supabase.from("credit_ledger").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("reason", "upgrade_grant"),
      supabase.from("credit_ledger").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("reason", "topup"),
      supabase.from("profiles").select("is_test_account").eq("id", profileId).single(),
    ]);
  assert.equal(monthlyGrants, 2);
  assert.equal(upgradeGrants, 1);
  assert.equal(topups, 1);
  assert.equal(profile?.is_test_account, true);

  console.log(JSON.stringify({
    status: "passed",
    identifiedTestRecords: {
      profileId,
      email,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
    },
    evidence: {
      stripeApiGenerated: [
        "customer",
        "payment method attachment",
        "subscription creation and updates",
        "billing portal session",
        "subscription cancellation",
      ],
      locallyConstructedSignedWebhooks: [
        "checkout.session.completed",
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ],
    },
    simulatedHandlerCases: [
      "paid signup",
      "duplicate invoice",
      "one-time top-up",
      "duplicate top-up",
      "paid upgrade",
      "next-renewal downgrade",
      "renewal",
      "failed renewal",
      "portal return",
      "scheduled cancellation",
      "final cancellation",
    ],
    cleanupPerformed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
