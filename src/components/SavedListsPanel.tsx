"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SavedListRecord } from "@/types/event";

function filterSummary(list: SavedListRecord): string {
  const parts: string[] = [];
  if (list.sector) parts.push(`Sector: ${list.sector}`);
  if (list.tier) parts.push(`Tier: ${list.tier}`);
  if (list.status) parts.push(`Status: ${list.status}`);
  if (list.from_date) parts.push(`From ${list.from_date}`);
  if (list.to_date) parts.push(`To ${list.to_date}`);
  if (list.q) parts.push(`Search: "${list.q}"`);
  if (list.discovery_run_id) parts.push("Saved search batch");
  return parts.join(" · ") || "No filters";
}

function listHref(list: SavedListRecord): string {
  const params = new URLSearchParams();
  if (list.sector) params.set("sector", list.sector);
  if (list.tier) params.set("tier", list.tier);
  if (list.status) params.set("status", list.status);
  if (list.from_date) params.set("from", list.from_date);
  if (list.to_date) params.set("to", list.to_date);
  if (list.q) params.set("q", list.q);
  if (list.discovery_run_id) params.set("runId", list.discovery_run_id);
  return `/?${params.toString()}`;
}

export function SavedListsPanel({ lists }: { lists: SavedListRecord[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function remove(list: SavedListRecord) {
    const count = list.eventCount ?? 0;
    const confirmed = window.confirm(
      `Delete "${list.name}"? This will permanently delete ${count} event${count === 1 ? "" : "s"} matching ` +
        `${filterSummary(list)}, along with any contacts found for them. This cannot be undone.`
    );
    if (!confirmed) return;

    setBusy((s) => ({ ...s, [list.id]: true }));
    try {
      const res = await fetch(`/api/saved-lists/${list.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        window.alert(`Failed to delete: ${json.error ?? "unknown error"}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy((s) => ({ ...s, [list.id]: false }));
    }
  }

  if (lists.length === 0) {
    return (
      <div className="rounded-lg border border-icon-border p-4 text-sm font-medium text-icon-text-light">
        No saved lists yet. Apply filters below, then click &quot;Save as list&quot; to bookmark them.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-icon-border p-4">
      <h2 className="mb-3 text-sm font-semibold text-icon-text">Saved lists</h2>
      <ul className="flex flex-col gap-2">
        {lists.map((list) => (
          <li
            key={list.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-icon-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <a href={listHref(list)} className="text-sm font-semibold text-icon-primary hover:underline">
                {list.name}
              </a>
              <p className="text-xs font-medium text-icon-text-light">
                {filterSummary(list)} · {list.eventCount ?? 0} event{(list.eventCount ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <button
              onClick={() => remove(list)}
              disabled={busy[list.id]}
              className="rounded border border-icon-border px-2 py-1 text-xs font-medium text-icon-text-light hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
            >
              {busy[list.id] ? "Deleting…" : `Delete list & ${list.eventCount ?? 0} event${(list.eventCount ?? 0) === 1 ? "" : "s"}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
