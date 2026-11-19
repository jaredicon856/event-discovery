"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type OpenPrivacyRequest = { id: string; email: string; created_at: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export function PrivacyRequestsPanel({ requests }: { requests: OpenPrivacyRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, status: "done" | "declined") {
    const note = window.prompt(
      status === "done" ? "Note (optional): what was done?" : "Why is this declined? (shown only in the audit log)"
    );
    if (note === null) return;
    setBusyId(id);
    setError(null);
    const response = await fetch(`/api/admin/privacy-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error ?? "Could not update the request.");
    }
    setBusyId(null);
    router.refresh();
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-400/60 bg-icon-surface p-5">
      <h2 className="text-lg font-semibold">Account deletion requests</h2>
      <p className="mt-1 text-sm text-icon-text-light">
        Customers asked to delete their account. Privacy laws expect an answer within about 30 days. Delete the account, then mark the request done.
      </p>
      <ul className="mt-4 divide-y divide-icon-border">
        {requests.map((request) => {
          const daysLeft = 30 - Math.floor((Date.now() - new Date(request.created_at).getTime()) / DAY_MS);
          return (
            <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{request.email}</p>
                <p className={`text-xs ${daysLeft <= 7 ? "font-semibold text-red-600" : "text-icon-text-light"}`}>
                  Requested {new Date(request.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })} ·{" "}
                  {daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busyId === request.id}
                  onClick={() => resolve(request.id, "done")}
                  className="min-h-10 cursor-pointer rounded-lg bg-icon-primary px-3 text-sm font-semibold text-icon-background disabled:opacity-60"
                >
                  Mark done
                </button>
                <button
                  disabled={busyId === request.id}
                  onClick={() => resolve(request.id, "declined")}
                  className="min-h-10 cursor-pointer rounded-lg border border-icon-border px-3 text-sm font-medium disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    </section>
  );
}
