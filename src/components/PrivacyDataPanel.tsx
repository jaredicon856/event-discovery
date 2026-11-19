"use client";

import { useState } from "react";

export function PrivacyDataPanel({ openDeleteRequestedAt }: { openDeleteRequestedAt: string | null }) {
  const [requestedAt, setRequestedAt] = useState<string | null>(openDeleteRequestedAt);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestDeletion() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/privacy/delete-request", { method: "POST" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error ?? "Could not submit your request.");
      setBusy(false);
      return;
    }
    setRequestedAt(json.createdAt ?? new Date().toISOString());
    setConfirming(false);
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-icon-border bg-icon-surface p-6">
      <h2 className="text-lg font-semibold">Your data</h2>
      <p className="mt-1 text-sm leading-6 text-icon-text-light">
        Download a copy of the personal information we hold about you, or ask us to delete your account.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href="/api/privacy/export"
          className="inline-flex min-h-11 items-center rounded-lg border border-icon-border px-4 text-sm font-semibold hover:border-icon-primary"
        >
          Download my data
        </a>
      </div>

      <div className="mt-6 border-t border-icon-border pt-5">
        <h3 className="text-sm font-semibold">Delete my account</h3>
        {requestedAt ? (
          <p role="status" className="mt-2 text-sm leading-6 text-icon-text-light">
            We received your deletion request on {new Date(requestedAt).toLocaleDateString("en-US", { dateStyle: "long" })}. We will respond within 30 days.
          </p>
        ) : confirming ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm leading-6 text-icon-text-light">
              This asks us to permanently delete your account, searches and saved contacts. Credits you have not used will be lost. We may keep payment and tax records the law requires.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={requestDeletion}
                disabled={busy}
                className="min-h-11 cursor-pointer rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Yes, request deletion"}
              </button>
              <button onClick={() => setConfirming(false)} className="min-h-11 cursor-pointer rounded-lg px-4 text-sm font-medium text-icon-text-light hover:text-icon-text">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-icon-text-light">We will review your request and respond within 30 days.</p>
            <button
              onClick={() => setConfirming(true)}
              className="mt-3 min-h-11 cursor-pointer rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Request account deletion
            </button>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    </section>
  );
}
