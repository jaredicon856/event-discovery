import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getSupabaseServiceClient } from "@/lib/supabase";
import {
  getPlan,
  getPlanByStripePriceId,
  getBillingIntervalForStripePriceId,
  getStripeClient,
  getTopupPack,
  type PlanDefinition,
} from "@/lib/stripe";
import { decidePaidInvoice, getCancellationState } from "@/lib/stripeLifecycle";
import { grantCredits } from "@/lib/credits";
import {
  sendCreditsToppedUpEmail,
  sendPaymentConfirmedEmail,
} from "@/lib/email/notify";

export const maxDuration = 30;

async function upsertSubscriptionFromStripe(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  sub: Stripe.Subscription,
  profileId: string,
  plan: PlanDefinition,
  pendingPlan: string | null = null
) {
  const item = sub.items.data[0] as Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = item.current_period_start
    ? new Date(item.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = item.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const cancellation = getCancellationState({
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelAt: sub.cancel_at,
    periodEnd,
  });

  const { error } = await supabase.from("subscriptions").upsert(
    {
      profile_id: profileId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      plan: plan.id,
      billing_interval: getBillingIntervalForStripePriceId(item.price.id),
      status: sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : sub.status === "canceled" ? "canceled" : "incomplete",
      credits_per_cycle: plan.creditsPerCycle,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: cancellation.scheduled,
      access_ends_at: sub.status === "canceled" ? periodEnd : cancellation.accessEndsAt,
      stripe_price_id: item.price.id,
      pending_plan: pendingPlan,
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) throw new Error(error.message);

  if (cancellation.scheduled && cancellation.accessEndsAt) {
    await supabase
      .from("credit_ledger")
      .update({ expires_at: cancellation.accessEndsAt })
      .eq("profile_id", profileId)
      .in("balance_bucket", ["subscription", "rollover"]);
  } else if (sub.status === "active") {
    await supabase
      .from("credit_ledger")
      .update({ expires_at: null })
      .eq("profile_id", profileId)
      .in("balance_bucket", ["subscription", "rollover"]);
  }
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as {
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  };
  const value = raw.subscription ?? raw.parent?.subscription_details?.subscription;
  return typeof value === "string" ? value : value?.id ?? null;
}

function periodEndForSubscription(subscription: Stripe.Subscription): string {
  const item = subscription.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
  if (!item.current_period_end) throw new Error("Stripe subscription has no item period end");
  return new Date(item.current_period_end * 1000).toISOString();
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  try {
    const { error: claimError } = await supabase.from("stripe_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
    });
    if (claimError?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claimError) throw new Error(claimError.message);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "payment" && session.metadata?.kind === "credit_topup") {
          const profileId = session.metadata?.profile_id;
          const pack = getTopupPack(session.metadata?.topup_pack_id ?? "");
          if (!profileId || !pack) {
            throw new Error("Top-up checkout session is missing required metadata");
          }
          if (session.payment_status !== "paid") break;

          await grantCredits(supabase, {
            profileId,
            amount: pack.credits,
            reason: "topup",
            bucket: "manual",
            note: `${pack.name} credit top-up`,
            stripeEventId: event.id,
          });
          try {
            await sendCreditsToppedUpEmail({
              supabase,
              profileId,
              packName: pack.name,
              credits: pack.credits,
              amountCents: session.amount_total ?? pack.priceUsd * 100,
              currency: session.currency ?? "usd",
            });
          } catch (mailError) {
            console.error("Top-up confirmation email failed", mailError);
          }
          break;
        }

        const profileId = session.metadata?.profile_id;
        const planId = session.metadata?.plan_id;
        if (!profileId || !planId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const plan = getPlan(planId);
        if (!plan) throw new Error(`Unknown checkout plan ${planId}`);
        await upsertSubscriptionFromStripe(supabase, subscription, profileId, plan);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (!subscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const stripePlan = getPlanByStripePriceId(subscription.items.data[0]?.price.id);
        if (!stripePlan) throw new Error("Invoice references an unconfigured Stripe Price");

        const { data: stored } = await supabase
          .from("subscriptions")
          .select("profile_id, plan, credits_per_cycle")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        const profileId = stored?.profile_id ?? subscription.metadata?.profile_id;
        if (!profileId) throw new Error("Paid invoice has no Event Scout profile");

        const periodEnd = periodEndForSubscription(subscription);
        const billingReason = (invoice as unknown as { billing_reason?: string }).billing_reason;
        const decision = decidePaidInvoice({
          billingReason,
          amountPaid: invoice.amount_paid,
          currentAllowance: stored?.credits_per_cycle ?? 0,
          candidatePlan: stripePlan,
        });
        if (decision.kind === "paid_upgrade") {
          if (decision.grantAmount > 0) {
            const { error } = await supabase.rpc("grant_paid_upgrade", {
              p_profile_id: profileId,
              p_amount: decision.grantAmount,
              p_period_end: periodEnd,
              p_stripe_event_id: event.id,
              p_stripe_invoice_id: invoice.id,
              p_note: `Paid upgrade to ${stripePlan.name}`,
            });
            if (error) throw new Error(error.message);
          }
        } else if (decision.kind === "cycle") {
          const { error } = await supabase.rpc("grant_subscription_cycle", {
            p_profile_id: profileId,
            p_allowance: stripePlan.creditsPerCycle,
            p_period_end: periodEnd,
            p_stripe_event_id: event.id,
            p_stripe_invoice_id: invoice.id,
            p_note: billingReason === "subscription_create"
              ? `${stripePlan.name} plan activated`
              : `${stripePlan.name} renewal credit grant`,
          });
          if (error) throw new Error(error.message);
        }
        if (decision.applyPlan) {
          await upsertSubscriptionFromStripe(supabase, subscription, profileId, stripePlan);
        } else if (stored) {
          const currentPlan = getPlan(stored.plan);
          if (currentPlan) {
            await upsertSubscriptionFromStripe(
              supabase,
              subscription,
              profileId,
              currentPlan,
              decision.kind === "pending_downgrade" ? stripePlan.id : null
            );
          }
        }

        if (invoice.amount_paid > 0 && decision.kind !== "pending_downgrade") {
          try {
            await sendPaymentConfirmedEmail({
              supabase,
              profileId,
              planName: stripePlan.name,
              amountCents: invoice.amount_paid,
              currency: invoice.currency || "usd",
              invoiceNumber: invoice.number,
              invoiceUrl: invoice.hosted_invoice_url,
              invoicePdfUrl: invoice.invoice_pdf,
            });
          } catch (mailError) {
            console.error("Payment confirmation email failed", mailError);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (subscriptionId) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const candidate = getPlanByStripePriceId(subscription.items.data[0]?.price.id);
        if (!candidate) throw new Error("Subscription references an unconfigured Stripe Price");
        const { data: stored } = await supabase
          .from("subscriptions")
          .select("profile_id, plan")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();
        const profileId = subscription.metadata?.profile_id ?? stored?.profile_id;
        if (!profileId) break;
        const current = getPlan(stored?.plan ?? "");
        const effective = current ?? candidate;
        const pendingPlan = current && current.id !== candidate.id ? candidate.id : null;
        await upsertSubscriptionFromStripe(supabase, subscription, profileId, effective, pendingPlan);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const endedAt = new Date().toISOString();
        const { data: stored } = await supabase
          .from("subscriptions")
          .update({ status: "canceled", access_ends_at: endedAt, cancel_at_period_end: false })
          .eq("stripe_subscription_id", subscription.id)
          .select("profile_id")
          .maybeSingle();
        if (stored) {
          await supabase
            .from("credit_ledger")
            .update({ expires_at: endedAt })
            .eq("profile_id", stored.profile_id)
            .in("balance_bucket", ["subscription", "rollover"]);
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    await supabase.from("stripe_webhook_events").delete().eq("event_id", event.id);
    const message = e instanceof Error ? e.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
