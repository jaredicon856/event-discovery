import assert from "node:assert/strict";
import test from "node:test";
import { getPlan } from "../src/lib/plans";
import { decidePaidInvoice, getCancellationState } from "../src/lib/stripeLifecycle";
import {
  formatInvoiceAmount,
  invoiceReasonTitle,
  invoiceStatusLabel,
  summarizeStripeInvoice,
} from "../src/lib/stripeInvoices";
import { isNavActive } from "../src/lib/navigation";

const starter = getPlan("starter")!;
const growth = getPlan("growth")!;

test("paid renewal applies the invoice plan and full cycle grant", () => {
  assert.deepEqual(
    decidePaidInvoice({
      billingReason: "subscription_cycle",
      amountPaid: 79_00,
      currentAllowance: starter.creditsPerCycle,
      candidatePlan: starter,
    }),
    { kind: "cycle", applyPlan: true, grantAmount: 1000 }
  );
});

test("paid upgrade grants only the allowance difference", () => {
  assert.deepEqual(
    decidePaidInvoice({
      billingReason: "subscription_update",
      amountPaid: 120_00,
      currentAllowance: starter.creditsPerCycle,
      candidatePlan: growth,
    }),
    { kind: "paid_upgrade", applyPlan: true, grantAmount: 1500 }
  );
});

test("downgrade remains pending until the next renewal", () => {
  assert.deepEqual(
    decidePaidInvoice({
      billingReason: "subscription_update",
      amountPaid: 0,
      currentAllowance: growth.creditsPerCycle,
      candidatePlan: starter,
    }),
    { kind: "pending_downgrade", applyPlan: false, grantAmount: 0 }
  );
});

test("an unpaid upgrade never changes allowance or grants credits", () => {
  assert.deepEqual(
    decidePaidInvoice({
      billingReason: "subscription_update",
      amountPaid: 0,
      currentAllowance: starter.creditsPerCycle,
      candidatePlan: growth,
    }),
    { kind: "unpaid_upgrade", applyPlan: false, grantAmount: 0 }
  );
});

test("Billing Portal cancellation timestamps schedule access to end", () => {
  assert.deepEqual(
    getCancellationState({
      cancelAtPeriodEnd: false,
      cancelAt: 1_792_755_597,
      periodEnd: "2026-10-23T11:39:57.000Z",
    }),
    {
      scheduled: true,
      accessEndsAt: "2026-10-23T11:39:57.000Z",
    }
  );
});

test("invoice history uses Stripe receipts rather than the credit ledger", () => {
  const paid = {
    id: "in_test_1",
    number: "INV-1042",
    created: 1_790_163_488,
    status: "paid",
    amount_paid: 7900,
    amount_due: 0,
    total: 7900,
    currency: "usd",
    billing_reason: "subscription_create",
    description: null,
    hosted_invoice_url: "https://invoice.stripe.com/i/acct_test/test",
    invoice_pdf: "https://pay.stripe.com/invoice/test/pdf",
    lines: { data: [{ description: "Starter plan" }] },
  } as never;
  const invoice = summarizeStripeInvoice(paid);

  assert.equal(invoice.title, "Starter plan");
  assert.equal(
    summarizeStripeInvoice({
      id: "in_test_2",
      number: "INV-1042",
      created: 1_790_163_488,
      status: "paid",
      amount_paid: 7900,
      amount_due: 0,
      total: 7900,
      currency: "usd",
      billing_reason: "subscription_create",
      description: null,
      hosted_invoice_url: "https://invoice.stripe.com/i/acct_test/test",
      invoice_pdf: "https://pay.stripe.com/invoice/test/pdf",
      lines: { data: [{ description: "1 × Event Scout Starter (at $79.00 / month)" }] },
    } as never).title,
    "Event Scout Starter"
  );
  assert.equal(invoice.amountCents, 7900);
  assert.equal(formatInvoiceAmount(invoice.amountCents, invoice.currency), "$79.00");
  assert.equal(invoiceStatusLabel("paid"), "Paid");
  assert.equal(invoiceReasonTitle("subscription_cycle"), "Monthly renewal");
});

test("invoice history is a sibling of billing, not a billing sub-page highlight", () => {
  assert.equal(isNavActive("/billing", "/billing"), true);
  assert.equal(isNavActive("/billing/plans/starter", "/billing"), true);
  assert.equal(isNavActive("/billing/invoices", "/billing"), false);
  assert.equal(isNavActive("/billing/invoices", "/billing/invoices"), true);
});
