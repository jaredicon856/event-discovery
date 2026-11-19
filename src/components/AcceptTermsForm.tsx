"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export function AcceptTermsForm({ email }: { email: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (!agreed) return;
    setSaving(true);
    setError(null);
    const response = await fetch("/api/legal/accept", { method: "POST" });
    if (!response.ok) {
      setError("We could not save that. Please try again.");
      setSaving(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-icon-background px-6 py-12 text-icon-text">
      <div className="w-full max-w-md rounded-2xl border border-icon-border bg-icon-surface p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-icon-primary">Event Scout</p>
        <h1 className="mt-3 text-2xl font-semibold">Before you continue</h1>
        <p className="mt-3 text-sm leading-6 text-icon-text-light">
          Please review and accept our terms to use Event Scout. Signed in as {email}.
        </p>
        <form onSubmit={accept} className="mt-6 space-y-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1 h-4 w-4 cursor-pointer accent-[#b88932]"
            />
            <span>
              I have read and agree to the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-icon-primary underline">Terms of Service</Link> and the{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-icon-primary underline">Privacy Policy</Link>.
            </span>
          </label>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <button
            disabled={!agreed || saving}
            className="min-h-11 w-full cursor-pointer rounded-lg bg-icon-primary px-4 font-semibold text-icon-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-icon-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
        <button onClick={signOut} className="mt-4 w-full cursor-pointer text-center text-sm text-icon-text-light hover:text-icon-text">
          Sign out instead
        </button>
      </div>
    </main>
  );
}
