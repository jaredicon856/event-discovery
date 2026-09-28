"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export function AccountSecurityPanel({
  email,
  providers,
  passwordEnabled,
}: {
  email: string;
  providers: string[];
  passwordEnabled: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"password" | "verify" | "sessions" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (newPassword !== confirmation) {
      setNotice({ type: "error", text: "New passwords do not match." });
      return;
    }
    setBusy("password");
    const supabase = getSupabaseBrowserClient();
    const reauthenticated = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthenticated.error) {
      setNotice({ type: "error", text: "Current password could not be verified." });
      setBusy(null);
      return;
    }
    const updated = await supabase.auth.updateUser({ password: newPassword });
    if (updated.error) setNotice({ type: "error", text: updated.error.message });
    else {
      await fetch("/api/auth/password-enabled", { method: "POST" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setNotice({ type: "success", text: "Password updated." });
    }
    setBusy(null);
  }

  async function sendFreshVerification() {
    setBusy("verify");
    setNotice(null);
    const response = await fetch("/api/auth/send-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next: "/reset-password?next=/settings/security" }),
    });
    setNotice(
      response.ok
        ? { type: "success", text: "Check your inbox. The password setup link performs a fresh identity verification." }
        : { type: "error", text: "Could not send the verification link. Try again in a moment." }
    );
    setBusy(null);
  }

  async function signOutOthers() {
    setBusy("sessions");
    setNotice(null);
    const { error } = await getSupabaseBrowserClient().auth.signOut({ scope: "others" });
    setNotice(
      error
        ? { type: "error", text: error.message }
        : { type: "success", text: "Other sessions have been signed out." }
    );
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-icon-border bg-icon-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Connected sign-in methods</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-icon-border p-4">
            <p className="font-medium">Google</p>
            <p className="mt-1 text-sm text-icon-text-light">{providers.includes("google") ? "Connected" : "Not connected"}</p>
          </div>
          <div className="rounded-xl border border-icon-border p-4">
            <p className="font-medium">Email &amp; password</p>
            <p className="mt-1 text-sm text-icon-text-light">{passwordEnabled ? "Password access enabled" : "No verified password setup recorded"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-icon-border bg-icon-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">{passwordEnabled ? "Change password" : "Add password access"}</h2>
        {passwordEnabled ? (
          <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Current password
              <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 text-base outline-none focus:border-icon-primary" />
            </label>
            <label className="text-sm font-medium">New password
              <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 text-base outline-none focus:border-icon-primary" />
            </label>
            <label className="text-sm font-medium">Confirm new password
              <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-icon-border bg-icon-background px-3.5 text-base outline-none focus:border-icon-primary" />
            </label>
            <button disabled={busy !== null} className="min-h-11 rounded-lg bg-icon-primary px-4 text-sm font-semibold text-white sm:col-span-2 sm:justify-self-start">{busy === "password" ? "Verifying…" : "Verify and change password"}</button>
          </form>
        ) : (
          <div className="mt-4">
            <p className="max-w-2xl text-sm leading-6 text-icon-text-light">For security, an existing session is not enough to add a password. We will email {email} a fresh verification link before password setup.</p>
            <button type="button" disabled={busy !== null} onClick={sendFreshVerification} className="mt-4 min-h-11 rounded-lg bg-icon-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{busy === "verify" ? "Sending…" : "Verify identity and add password"}</button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-icon-border bg-icon-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <p className="mt-1 text-sm text-icon-text-light">Sign out every other browser and device while keeping this session active.</p>
        <button type="button" disabled={busy !== null} onClick={signOutOthers} className="mt-4 rounded-lg border border-icon-border px-4 py-2.5 text-sm font-semibold hover:border-icon-primary disabled:opacity-60">{busy === "sessions" ? "Signing out…" : "Sign out other sessions"}</button>
      </section>

      {notice && <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</p>}
    </div>
  );
}
