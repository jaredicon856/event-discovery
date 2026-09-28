// Runtime guard instead of the `server-only` package: that package throws
// unconditionally on any non-Next-bundled import (e.g. tsx-run scripts/tests),
// even in trusted server contexts. This achieves the same "never reaches the
// browser" protection without breaking CLI scripts and test runs.
if (typeof window !== "undefined") {
  throw new Error("src/lib/email/notify.ts must not be imported from a Client Component module.");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  creditsToppedUpEmail,
  ownerNewPlanEmail,
  ownerNewTrialEmail,
  paymentConfirmedEmail,
  trialCompleteEmail,
} from "@/lib/email/templates";
import { appOrigin, ownerAlertEmail, sendEmail } from "@/lib/email/resend";
import { formatInvoiceAmount } from "@/lib/stripeInvoices";
import { formatAccountDateTime } from "@/lib/timezone";

async function ownerAlertProfile(supabase: SupabaseClient, profileId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name, display_name, company, is_test_account, role")
    .eq("id", profileId)
    .maybeSingle();
  if (!data?.email || data.role === "super_admin") return null;
  return data as {
    email: string;
    full_name: string | null;
    display_name: string | null;
    company: string | null;
    is_test_account: boolean;
  };
}

/** Owner alert when a new member receives the free trial. Never throws. */
export async function sendOwnerNewTrialAlert(
  supabase: SupabaseClient,
  profileId: string
): Promise<void> {
  try {
    const profile = await ownerAlertProfile(supabase, profileId);
    if (!profile) return;
    const template = ownerNewTrialEmail({
      email: profile.email,
      name: profile.full_name || profile.display_name,
      company: profile.company,
      isTestAccount: profile.is_test_account,
      signedUpLabel: `${formatAccountDateTime(new Date())} ET`,
      adminUrl: `${appOrigin()}/admin?member=${profileId}`,
    });
    await sendEmail({
      to: ownerAlertEmail(),
      replyTo: profile.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "category", value: "owner_new_trial" }],
    });
  } catch (error) {
    console.error("Owner new-trial alert failed", error);
  }
}

/** Owner alert when a member starts a paid plan. Never throws. */
export async function sendOwnerNewPlanAlert(input: {
  supabase: SupabaseClient;
  profileId: string;
  planName: string;
  interval: "month" | "year";
  amountCents: number;
  currency: string;
}): Promise<void> {
  try {
    const profile = await ownerAlertProfile(input.supabase, input.profileId);
    if (!profile) return;
    const template = ownerNewPlanEmail({
      email: profile.email,
      name: profile.full_name || profile.display_name,
      company: profile.company,
      isTestAccount: profile.is_test_account,
      planName: input.planName,
      billingLabel: input.interval === "year" ? "Annual" : "Monthly",
      amountLabel: formatInvoiceAmount(input.amountCents, input.currency),
      adminUrl: `${appOrigin()}/admin?member=${input.profileId}`,
    });
    await sendEmail({
      to: ownerAlertEmail(),
      replyTo: profile.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "category", value: "owner_new_plan" }],
    });
  } catch (error) {
    console.error("Owner new-plan alert failed", error);
  }
}

export async function profileEmail(
  supabase: SupabaseClient,
  profileId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", profileId)
    .maybeSingle();
  const email = data?.email?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

export async function maybeSendTrialCompleteEmail(
  supabase: SupabaseClient,
  profileId: string,
  discoveryRunId?: string
): Promise<void> {
  try {
    if (discoveryRunId) {
      const { data: op } = await supabase
        .from("credit_operations")
        .select("debit_breakdown")
        .eq("discovery_run_id", discoveryRunId)
        .eq("action", "discovery_usage")
        .maybeSingle();
      const breakdown = op?.debit_breakdown as { trial?: number } | null;
      if (!breakdown?.trial) return;
    }

    const [{ data: trial }, { data: subscription }, email] = await Promise.all([
      supabase
        .from("trial_entitlements")
        .select("discovery_remaining")
        .eq("profile_id", profileId)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("status")
        .eq("profile_id", profileId)
        .in("status", ["active", "past_due"])
        .limit(1)
        .maybeSingle(),
      profileEmail(supabase, profileId),
    ]);

    if (!email || subscription || (trial?.discovery_remaining ?? 1) > 0) return;

    const billingUrl = `${appOrigin()}/billing#plans`;
    const template = trialCompleteEmail({ billingUrl });
    await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [
        { name: "category", value: "trial_complete" },
        { name: "profile", value: profileId.replace(/-/g, "") },
      ],
    });
  } catch {
    // Never block discovery on mail delivery.
  }
}

export async function sendPaymentConfirmedEmail(input: {
  supabase: SupabaseClient;
  profileId: string;
  planName: string;
  amountCents: number;
  currency: string;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
}): Promise<void> {
  const email = await profileEmail(input.supabase, input.profileId);
  if (!email) return;

  const billingUrl = `${appOrigin()}/billing/invoices`;
  const amountLabel = formatInvoiceAmount(input.amountCents, input.currency);
  const template = paymentConfirmedEmail({
    planName: input.planName,
    amountLabel,
    invoiceNumber: input.invoiceNumber,
    invoiceUrl: input.invoiceUrl || billingUrl,
    billingUrl,
  });

  let pdf: { filename: string; content: Buffer } | undefined;
  if (input.invoicePdfUrl) {
    try {
      const response = await fetch(input.invoicePdfUrl);
      if (response.ok) {
        pdf = {
          filename: `event-scout-invoice-${input.invoiceNumber ?? "receipt"}.pdf`,
          content: Buffer.from(await response.arrayBuffer()),
        };
      }
    } catch {
      // Still send the receipt without the attachment.
    }
  }

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "payment_confirmed" }],
    files: pdf ? [pdf] : undefined,
  });
}

export async function sendCreditsToppedUpEmail(input: {
  supabase: SupabaseClient;
  profileId: string;
  packName: string;
  credits: number;
  amountCents?: number;
  currency?: string;
}): Promise<void> {
  const email = await profileEmail(input.supabase, input.profileId);
  if (!email) return;

  const billingUrl = `${appOrigin()}/billing#add-credits`;
  const amountLabel =
    typeof input.amountCents === "number"
      ? formatInvoiceAmount(input.amountCents, input.currency ?? "usd")
      : undefined;
  const template = creditsToppedUpEmail({
    packName: input.packName,
    credits: input.credits,
    amountLabel,
    billingUrl,
  });
  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "credits_topup" }],
  });
}
