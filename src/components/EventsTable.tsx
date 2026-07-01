"use client";

import { useState } from "react";
import type { EventRecord } from "@/types/event";

const TIER_STYLES: Record<string, string> = {
  A: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  B: "bg-sky-900/40 text-sky-300 border-sky-700",
  C: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-900/40 text-emerald-300",
  closed: "bg-red-900/40 text-red-300",
  watch: "bg-amber-900/40 text-amber-300",
  unknown: "bg-zinc-800 text-zinc-400",
};

export function EventsTable({ events }: { events: EventRecord[] }) {
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});
  const [enrichResults, setEnrichResults] = useState<Record<string, number>>({});

  async function enrich(eventId: string) {
    setEnriching((s) => ({ ...s, [eventId]: true }));
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json();
      setEnrichResults((s) => ({ ...s, [eventId]: json.inserted ?? 0 }));
    } finally {
      setEnriching((s) => ({ ...s, [eventId]: false }));
    }
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
        No events match these filters yet. Try widening the filters or run discovery for a sector.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="min-w-full divide-y divide-zinc-800 text-sm">
        <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Dates</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">CFP Deadline</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3">Best Fit</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Contacts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-zinc-900/50">
              <td className="max-w-xs px-4 py-3 font-medium text-zinc-200">{event.event_name}</td>
              <td className="px-4 py-3 text-zinc-400">{event.sector}</td>
              <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                {event.date_notes || event.event_start || "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                {[event.city, event.state_country].filter(Boolean).join(", ") || "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status] ?? STATUS_STYLES.unknown}`}
                >
                  {event.status}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{event.cfp_deadline || "—"}</td>
              <td className="px-4 py-3">
                {event.visibility_tier ? (
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[event.visibility_tier]}`}
                  >
                    {event.visibility_tier}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="max-w-xs px-4 py-3 text-zinc-400">{event.best_client_fit || "—"}</td>
              <td className="px-4 py-3">
                {event.source_url ? (
                  <a
                    href={event.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    link
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <button
                  onClick={() => enrich(event.id)}
                  disabled={enriching[event.id]}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {enriching[event.id] ? "Searching…" : "Find contact"}
                </button>
                {enrichResults[event.id] !== undefined && (
                  <span className="ml-2 text-xs text-zinc-500">
                    {enrichResults[event.id] > 0 ? `+${enrichResults[event.id]} found` : "none found"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
