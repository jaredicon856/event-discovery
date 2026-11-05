import { NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";
import { getStripeClient } from "@/lib/stripe";
import { assertTestModePrices, isLiveCheckout } from "@/lib/stripeCheckout";

export const dynamic = "force-dynamic";

const WEBHOOK_PATH = "/api/stripe/webhook";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

type Check = { check: string; ok: boolean; detail: string };

// Owner-only read-only check of the Stripe setup, so live billing can be
// verified without a real purchase. It never charges anything or shows a key.
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const checks: Check[] = [];
  const add = (check: string, ok: boolean, detail: string) => checks.push({ check, ok, detail });
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const live = isLiveCheckout();

  add("Checkout switched on", process.env.STRIPE_CHECKOUT_ENABLED === "true", `STRIPE_CHECKOUT_ENABLED is ${process.env.STRIPE_CHECKOUT_ENABLED === "true" ? "true" : "not true"}`);
  add("Mode", true, live ? "Live (STRIPE_ALLOW_LIVE_CHECKOUT is true)" : "Test (STRIPE_ALLOW_LIVE_CHECKOUT is not true)");
  add("Secret key matches the mode", live ? /^(sk|rk)_live_/.test(key) : /^(sk|rk)_test_/.test(key), `Key starts with ${key.slice(0, 8) || "(missing)"}…`);
  add("Webhook signing secret set", (process.env.STRIPE_WEBHOOK_SECRET ?? "").startsWith("whsec_"), "Format only: Stripe can't confirm it without a real event");

  try {
    await assertTestModePrices({ requireAnnual: true });
    add("Six plan prices", true, `All six exist in ${live ? "live" : "test"} mode, in USD, with the expected amounts and intervals`);
  } catch (error) {
    add("Six plan prices", false, error instanceof Error ? error.message : "Price check failed");
  }

  try {
    const stripe = getStripeClient();
    const { data: endpoints } = await stripe.webhookEndpoints.list({ limit: 100 });
    const ours = endpoints.filter((e) => new URL(e.url).pathname === WEBHOOK_PATH);
    const host = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const match = ours.find((e) => e.status === "enabled" && (!host || e.url.startsWith(host)));
    if (!match) {
      add("Webhook endpoint", false, `No enabled endpoint for ${host || "this app"}${WEBHOOK_PATH} (found ${ours.length} for that path)`);
    } else {
      const events = new Set(match.enabled_events);
      const missing = events.has("*") ? [] : WEBHOOK_EVENTS.filter((e) => !events.has(e));
      add("Webhook endpoint", missing.length === 0, missing.length ? `${match.url} is missing: ${missing.join(", ")}` : `${match.url} is enabled with all five events (API ${match.api_version ?? "account default"})`);
    }

    const portals = await stripe.billingPortal.configurations.list({ limit: 10, is_default: true });
    const portal = portals.data[0];
    add(
      "Customer portal",
      Boolean(portal?.active),
      portal
        ? `Default portal active ${portal.active}; cancel ${portal.features.subscription_cancel.enabled}, switch plans ${portal.features.subscription_update.enabled}, payment methods ${portal.features.payment_method_update.enabled}`
        : "No default portal configuration saved yet",
    );
  } catch (error) {
    add("Stripe account reachable", false, error instanceof Error ? error.message : "Stripe call failed");
  }

  return NextResponse.json({ ok: checks.every((c) => c.ok), checks }, { headers: { "cache-control": "no-store" } });
}
