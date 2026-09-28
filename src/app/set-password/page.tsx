"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    await fetch("/api/auth/password-enabled", { method: "POST" });
    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061b1c] px-6 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c59a48]">Identity verified</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">Create your password</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">Use this password with the verified email that received your invitation.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-medium">Password
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-black/15 px-3.5 text-base outline-none focus:border-[#c59a48] focus:ring-2 focus:ring-[#c59a48]/25" />
          </label>
          <label className="block text-sm font-medium">Confirm password
            <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-black/15 px-3.5 text-base outline-none focus:border-[#c59a48] focus:ring-2 focus:ring-[#c59a48]/25" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-sm text-red-100">{error}</p>}
          <button disabled={loading} className="min-h-11 w-full cursor-pointer rounded-lg bg-[#b0863c] px-4 text-sm font-semibold transition-colors hover:bg-[#96712f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c59a48] disabled:opacity-60">{loading ? "Saving password…" : "Save password and continue"}</button>
        </form>
      </div>
    </main>
  );
}
