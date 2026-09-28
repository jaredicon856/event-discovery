import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";

export interface CustomerInvoice {
  id: string;
  number: string | null;
  createdAt: string;
  status: string;
  amountCents: number;
  currency: string;
  title: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

const REASON_TITLES: Record<string, string> = {
  subscription_create: "Plan signup",
  subscription_cycle: "Monthly renewal",
  subscription_update: "Plan change",
  subscription_threshold: "Usage invoice",
  manual: "One-time charge",
  upcoming: "Upcoming invoice",
};

export function invoiceLineTitle(
  lineDescription: string | null | undefined,
  billingReason: string | null | undefined
): string {
  const cleaned = lineDescription
    ?.replace(/^\d+\s*[×x]\s*/i, "")
    .replace(/\s*\(at .*\)\s*$/i, "")
    .trim();
  return cleaned || invoiceReasonTitle(billingReason);
}

export function invoiceReasonTitle(billingReason: string | null | undefined): string {
  if (!billingReason) return "Invoice";
  return REASON_TITLES[billingReason] ?? billingReason.replaceAll("_", " ");
}

export function invoiceStatusLabel(status: string | null | undefined): string {
  if (!status) return "Open";
  const normalized = status === "uncollectible" ? "unpaid" : status.replaceAll("_", " ");
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatInvoiceAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase() || "USD",
  }).format(amountCents / 100);
}

export function summarizeStripeInvoice(invoice: Stripe.Invoice): CustomerInvoice {
  const lineDescription = invoice.lines?.data?.find((line) => line.description)?.description;
  const amountCents =
    invoice.status === "paid" ? invoice.amount_paid : invoice.amount_due || invoice.total;
  return {
    id: invoice.id,
    number: invoice.number,
    createdAt: new Date(invoice.created * 1000).toISOString(),
    status: invoice.status ?? "open",
    amountCents,
    currency: invoice.currency || "usd",
    title: invoiceLineTitle(lineDescription, invoice.billing_reason),
    hostedUrl: invoice.hosted_invoice_url ?? null,
    pdfUrl: invoice.invoice_pdf ?? null,
  };
}

export async function listCustomerInvoices(customerId: string, limit = 24): Promise<CustomerInvoice[]> {
  const stripe = getStripeClient();
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });
  return invoices.data.map(summarizeStripeInvoice);
}
