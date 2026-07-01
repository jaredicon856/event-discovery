"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscoveryScheduleRecord } from "@/types/event";

export function SchedulesPanel({ schedules }: { schedules: DiscoveryScheduleRecord[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function toggle(id: string, enabled: boolean) {
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      router.refresh();
    } finally {
      setBusy((s) => ({ ...s, [id]: false }));
    }
  }

  async function remove(id: string) {
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy((s) => ({ ...s, [id]: false }));
    }
  }

  if (schedules.length === 0) {
    return (
      <div className="rounded-lg border border-icon-border p-4 text-sm text-icon-text-light">
        No scheduled searches yet. Check &quot;Repeat this search daily&quot; above when running a
        discovery to save it here.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-icon-border p-4">
      <h2 className="mb-3 text-sm font-semibold text-icon-text">
        Scheduled searches <span className="font-normal text-icon-text-light">(run daily via cron)</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {schedules.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-icon-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-icon-text">
                <span className="font-medium">{s.sector}</span>{" "}
                <span className="text-icon-text-light">— {s.query}</span>
              </p>
              <p className="text-xs text-icon-text-light">
                {s.last_run_at
                  ? `Last run ${new Date(s.last_run_at).toLocaleString()} — ${s.last_run_summary ?? ""}`
                  : "Not run yet"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggle(s.id, !s.enabled)}
                disabled={busy[s.id]}
                className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${
                  s.enabled
                    ? "border-icon-primary text-icon-primary hover:bg-icon-primary-light"
                    : "border-icon-border text-icon-text-light hover:bg-icon-surface"
                }`}
              >
                {s.enabled ? "Enabled" : "Disabled"}
              </button>
              <button
                onClick={() => remove(s.id)}
                disabled={busy[s.id]}
                className="rounded border border-icon-border px-2 py-1 text-xs text-icon-text-light hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
