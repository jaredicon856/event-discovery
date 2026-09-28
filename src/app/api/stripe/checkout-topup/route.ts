import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { getStripeClient, getStripeTopupPriceId, getTopupPack } from "@/lib/stripe";
import { StripeConfigError, assertLocalTopupCheckoutEnabled } from "@/lib/stripeCheckout";

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

  let body: { packId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pack = getTopupPack(body.packId ?? "");
  if (!pack) {
    return NextResponse.json({ error: "Unknown credit pack" }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const priceId = getStripeTopupPriceId(pack);
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
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      locale: "en",
      // Keep the charge in USD so it matches the price shown on the billing page.
      adaptive_pricing: { enabled: false },
      client_reference_id: context.user.id,
      custom_text: {
        submit: {
          message: `${pack.credits.toLocaleString()} credits are added to your workspace immediately after payment. This is a one-time purchase and does not change your monthly plan.`,
        },
      },
      metadata: {
        kind: "credit_topup",
        profile_id: context.user.id,
        topup_pack_id: pack.id,
        credits: String(pack.credits),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
