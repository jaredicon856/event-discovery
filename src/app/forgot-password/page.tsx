"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    await fetch("/api/auth/send-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next: "/reset-password" }),
    });
    setMessage("If an eligible account exists, a password-reset link has been sent.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-icon-background px-6 text-icon-text">
      <div className="w-full max-w-md rounded-xl border border-icon-border bg-icon-surface p-7">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-icon-text-light">We’ll email a secure reset link to your account address.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30" />
          </label>
          {message && <p role="status" className="text-sm text-icon-text-light">{message}</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button disabled={loading} className="min-h-11 w-full cursor-pointer rounded-lg bg-icon-primary font-semibold text-icon-background disabled:opacity-60">
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <Link href="/login" className="mt-5 block text-center text-sm text-icon-primary hover:underline">Back to sign in</Link>
      </div>
    </main>
  );
}
