import type { Metadata } from "next";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe | Event Scout", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  const valid = Boolean(verifyUnsubscribeToken(token));

  return (
    <main className="flex min-h-screen items-center justify-center bg-icon-background px-6 py-12 text-icon-text">
      <div className="w-full max-w-md rounded-2xl border border-icon-border bg-icon-surface p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-icon-primary">Event Scout</p>
        {done ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold">You are unsubscribed</h1>
            <p className="mt-3 text-sm leading-6 text-icon-text-light">
              You will no longer get trial and welcome emails from Event Scout. You will still get emails about your account, such as receipts and password resets.
            </p>
          </>
        ) : valid ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold">Unsubscribe from reminder emails?</h1>
            <p className="mt-3 text-sm leading-6 text-icon-text-light">
              We will stop sending trial reminders and welcome emails. Receipts and security emails will still be sent.
            </p>
            <form method="POST" action={`/api/email/unsubscribe?token=${encodeURIComponent(token ?? "")}`} className="mt-6">
              <input type="hidden" name="redirect" value="1" />
              <button className="min-h-11 w-full cursor-pointer rounded-lg bg-icon-primary px-4 font-semibold text-icon-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-icon-primary">
                Unsubscribe
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold">This link is not valid</h1>
            <p className="mt-3 text-sm leading-6 text-icon-text-light">
              Use the unsubscribe link in your most recent email, or reply to any Event Scout email and we will remove you.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
