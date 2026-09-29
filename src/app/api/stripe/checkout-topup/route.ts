import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { getStripeClient } from "@/lib/stripe";
import { StripeConfigError, assertLocalTopupCheckoutEnabled } from "@/lib/stripeCheckout";
import { TOPUP_MAX_USD, TOPUP_MIN_USD, isValidTopupAmount, quoteTopup } from "@/lib/topup";

export async function POST(request: NextRequest) {
  try {
    await assertLocalTopupCheckoutEnabled();
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

  let body: { amountUsd?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidTopupAmount(body.amountUsd)) {
    return NextResponse.json(
      { error: `Enter a whole-dollar amount between $${TOPUP_MIN_USD} and $${TOPUP_MAX_USD.toLocaleString("en-US")}` },
      { status: 400 }
    );
  }
  const quote = quoteTopup(body.amountUsd);

  try {
    const stripe = getStripeClient();
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
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.amountUsd * 100,
            product_data: {
              name: `${quote.credits.toLocaleString("en-US")} credits`,
              description: `One-time credit top-up · about ${quote.actions.toLocaleString("en-US")} searches or contact lookups`,
            },
          },
        },
      ],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      locale: "en",
      // Keep the charge in USD so it matches the price shown on the billing page.
      adaptive_pricing: { enabled: false },
      client_reference_id: context.user.id,
      custom_text: {
        submit: {
          message: `${quote.credits.toLocaleString("en-US")} credits are added to your workspace immediately after payment. This is a one-time purchase and does not change your monthly plan.`,
        },
      },
      metadata: {
        kind: "credit_topup",
        profile_id: context.user.id,
        amount_usd: String(quote.amountUsd),
        credits: String(quote.credits),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
