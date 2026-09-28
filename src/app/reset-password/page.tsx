"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (!accessToken || !refreshToken) {
      getSupabaseBrowserClient().auth.getSession().then(({ data }) => {
        setSessionReady(Boolean(data.session));
        if (!data.session) setError("This reset link is invalid or expired. Request a new one.");
      });
      return;
    }
    getSupabaseBrowserClient().auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError("This reset link is invalid or expired. Request a new one.");
          return;
        }
        window.history.replaceState(null, "", "/reset-password");
        setSessionReady(true);
      });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    await fetch("/api/auth/password-enabled", { method: "POST" });
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    router.push(requestedNext?.startsWith("/") ? requestedNext : "/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-icon-background px-6 text-icon-text">
      <div className="w-full max-w-md rounded-xl border border-icon-border bg-icon-surface p-7">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            New password
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/30" />
          </label>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button disabled={loading || !sessionReady} className="min-h-11 w-full cursor-pointer rounded-lg bg-icon-primary font-semibold text-icon-background disabled:opacity-60">
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
