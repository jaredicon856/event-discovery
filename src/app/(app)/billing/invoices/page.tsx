import Link from "next/link";
import { requireActiveUser } from "@/lib/access";
import {
  formatInvoiceAmount,
  invoiceStatusLabel,
  listCustomerInvoices,
} from "@/lib/stripeInvoices";
import { formatAccountDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function InvoiceHistoryPage() {
  const { profile, service } = await requireActiveUser();

  if (profile.role === "super_admin") {
    return (
      <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto max-w-3xl">
          <p className="premium-eyebrow">Billing</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.055em]">Invoice history</h1>
          <p className="premium-subtitle mt-4">
            Owner accounts are not billed. Customer invoices appear on each client’s Invoice history
            page.
          </p>
        </div>
      </div>
    );
  }

  const { data } = await service
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", profile.id)
    .single();

  let invoices: Awaited<ReturnType<typeof listCustomerInvoices>> = [];
  let loadError: string | null = null;
  if (data?.stripe_customer_id) {
    try {
      invoices = await listCustomerInvoices(data.stripe_customer_id);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load invoices";
    }
  }

  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="animate-enter">
          <p className="premium-eyebrow">Account</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">Invoice history</h1>
          <p className="premium-subtitle mt-4 max-w-2xl">
            Receipts for plan payments and credit purchases. Open an invoice to view or download the
            PDF.
          </p>
        </header>

        {loadError && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            {loadError}
          </p>
        )}

        {!data?.stripe_customer_id && !loadError && (
          <section className="premium-card p-7">
            <p className="text-lg font-semibold">No invoices yet</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-icon-text-light">
              Invoices appear here after you choose a plan or buy extra credits.
            </p>
            <Link href="/billing" className="mt-5 inline-flex text-sm font-semibold text-icon-primary hover:underline">
              Go to billing
            </Link>
          </section>
        )}

        {data?.stripe_customer_id && invoices.length === 0 && !loadError && (
          <section className="premium-card p-7">
            <p className="text-lg font-semibold">No invoices yet</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-icon-text-light">
              Stripe has not issued an invoice for this account. Once a payment completes, it will
              show here.
            </p>
            <Link href="/billing" className="mt-5 inline-flex text-sm font-semibold text-icon-primary hover:underline">
              Go to billing
            </Link>
          </section>
        )}

        {invoices.length > 0 && (
          <section className="premium-card overflow-x-auto p-0">
            <div className="min-w-[40rem]">
              <div className="grid grid-cols-[8rem_minmax(0,1.4fr)_5.5rem_6.5rem_5.5rem] gap-3 border-b border-icon-border px-6 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-icon-text-light">
                <span>Date</span>
                <span>Invoice</span>
                <span>Status</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              <ul className="divide-y divide-icon-border">
                {invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="grid grid-cols-[8rem_minmax(0,1.4fr)_5.5rem_6.5rem_5.5rem] items-center gap-3 px-6 py-4"
                  >
                    <p className="text-sm text-icon-text-light">{formatAccountDate(invoice.createdAt)}</p>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{invoice.title}</p>
                      <p className="mt-0.5 truncate text-xs text-icon-text-light">
                        {invoice.number ? `Invoice ${invoice.number}` : invoice.id}
                      </p>
                    </div>
                    <p className="text-sm capitalize">{invoiceStatusLabel(invoice.status)}</p>
                    <p className="text-right text-sm font-semibold">
                      {formatInvoiceAmount(invoice.amountCents, invoice.currency)}
                    </p>
                    <div className="flex justify-end gap-3 text-sm font-semibold text-icon-primary">
                      {invoice.hostedUrl && (
                        <a href={invoice.hostedUrl} target="_blank" rel="noreferrer">
                          View
                        </a>
                      )}
                      {invoice.pdfUrl && (
                        <a href={invoice.pdfUrl} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
