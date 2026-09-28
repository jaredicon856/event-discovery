"use client";

import Link from "next/link";
import { useState } from "react";

export default function RequestAccessPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        name: form.get("name"),
        message: form.get("message"),
      }),
    });
    const json = await response.json();
    setResult(json.message ?? json.error ?? "Request submitted");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-icon-background px-6 py-12 text-icon-text">
      <div className="w-full max-w-lg rounded-xl border border-icon-border bg-icon-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-icon-primary">Event Scout</p>
        <h1 className="mt-3 text-3xl font-semibold">Request access</h1>
        <p className="mt-2 text-sm leading-6 text-icon-text-light">
          Event Scout is invitation-only. Tell the Project ICON team who you are and we’ll review your request.
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-medium">
            Name
            <input name="name" autoComplete="name" className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30" />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" autoComplete="email" required className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30" />
          </label>
          <label className="block text-sm font-medium">
            How would you use Event Scout?
            <textarea name="message" rows={4} className="mt-1.5 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 py-3 outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30" />
          </label>
          {result && <p role="status" className="text-sm text-icon-text-light">{result}</p>}
          <button disabled={loading} className="min-h-11 w-full cursor-pointer rounded-lg bg-icon-primary px-4 font-semibold text-icon-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-icon-primary disabled:opacity-60">
            {loading ? "Submitting…" : "Submit request"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-icon-text-light">
          Already invited? <Link href="/login" className="text-icon-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
