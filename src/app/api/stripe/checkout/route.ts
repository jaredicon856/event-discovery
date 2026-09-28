import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import {
  getPlan,
  getStripeClient,
  getStripePriceId,
  type BillingInterval,
} from "@/lib/stripe";
import { StripeConfigError, assertLocalTestCheckoutEnabled } from "@/lib/stripeCheckout";

export async function POST(request: NextRequest) {
  let body: { planId?: string; interval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const interval: BillingInterval = body.interval === "year" ? "year" : "month";

  try {
    await assertLocalTestCheckoutEnabled(interval);
  } catch (error) {
    const message = error instanceof StripeConfigError ? error.message : "Checkout is disabled";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const plan = getPlan(body.planId ?? "");
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const priceId = getStripePriceId(plan, interval);
    const supabase = context.service;

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", context.user.id)
      .single();

    let customerId = profile?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? context.user.email ?? undefined,
        metadata: { profile_id: context.user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", context.user.id);
    }

    const origin = request.headers.get("origin") ?? request.nextUrl.origin;
    const cadence =
      interval === "year"
        ? `Billed annually at $${plan.priceAnnual.toLocaleString()}. You still receive ${plan.creditsPerCycle.toLocaleString()} research credits every month.`
        : `Your ${plan.name} workspace unlocks ${plan.creditsPerCycle.toLocaleString()} research credits each month. Cancel anytime.`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: context.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      locale: "en",
      adaptive_pricing: { enabled: false },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      custom_text: {
        submit: { message: cadence },
      },
      metadata: {
        profile_id: context.user.id,
        plan_id: plan.id,
        billing_interval: interval,
      },
      subscription_data: {
        metadata: {
          profile_id: context.user.id,
          plan_id: plan.id,
          billing_interval: interval,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
