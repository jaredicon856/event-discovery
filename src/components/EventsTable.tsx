"use client";

import { useState } from "react";
import type { ContactRecord, EventRecord } from "@/types/event";
import { ContactsModal } from "@/components/ContactsModal";

const TIER_STYLES: Record<string, string> = {
  A: "bg-icon-primary-light text-icon-primary border-icon-primary",
  B: "bg-sky-900/40 text-sky-300 border-sky-700",
  C: "bg-icon-surface text-icon-text-light border-icon-border",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-900/40 text-emerald-300",
  closed: "bg-red-900/40 text-red-300",
  watch: "bg-amber-900/40 text-amber-300",
  unknown: "bg-icon-surface text-icon-text-light",
};

/** Agent-extracted URLs sometimes come back without a scheme (e.g. "linkedin.com/in/x"),
 * which browsers then resolve as a path relative to the current site. */
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function EventsTable({
  events,
  initialContacts,
}: {
  events: EventRecord[];
  initialContacts: Record<string, ContactRecord[]>;
}) {
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});
  const [contactsByEvent, setContactsByEvent] = useState<Record<string, ContactRecord[]>>(initialContacts);
  const [attempted, setAttempted] = useState<Record<string, boolean>>({});
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  async function enrich(eventId: string) {
    setEnriching((s) => ({ ...s, [eventId]: true }));
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json();
      setAttempted((s) => ({ ...s, [eventId]: true }));
      if (Array.isArray(json.contacts) && json.contacts.length > 0) {
        setContactsByEvent((s) => ({
          ...s,
          [eventId]: [...(s[eventId] ?? []), ...json.contacts],
        }));
        setOpenEventId(eventId);
      }
    } finally {
      setEnriching((s) => ({ ...s, [eventId]: false }));
    }
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-icon-border p-8 text-center text-icon-text-light">
        No events match these filters yet. Try widening the filters or run discovery for a sector.
      </div>
    );
  }

  const openEvent = events.find((e) => e.id === openEventId);

  return (
    <div className="overflow-x-auto rounded-lg border border-icon-border">
      <table className="min-w-full divide-y divide-icon-border text-sm">
        <thead className="bg-icon-primary-light text-left text-xs uppercase tracking-wide text-icon-text-light">
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
        <tbody className="divide-y divide-icon-border">
          {events.map((event) => {
            const contacts = contactsByEvent[event.id] ?? [];
            return (
              <tr key={event.id} className="align-top hover:bg-icon-primary-light">
                <td className="max-w-xs px-4 py-3 font-medium text-icon-text">{event.event_name}</td>
                <td className="px-4 py-3 text-icon-text-light">{event.sector}</td>
                <td className="px-4 py-3 whitespace-nowrap text-icon-text-light">
                  {event.date_notes || event.event_start || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-icon-text-light">
                  {[event.city, event.state_country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status] ?? STATUS_STYLES.unknown}`}
                  >
                    {event.status}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-icon-text-light">{event.cfp_deadline || "—"}</td>
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
                <td className="max-w-xs px-4 py-3 text-icon-text-light">{event.best_client_fit || "—"}</td>
                <td className="px-4 py-3">
                  {event.source_url ? (
                    <a
                      href={normalizeUrl(event.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-icon-primary hover:underline"
                    >
                      link
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => enrich(event.id)}
                      disabled={enriching[event.id]}
                      className="rounded border border-icon-border px-2 py-1 text-xs text-icon-text hover:bg-icon-surface disabled:opacity-50"
                    >
                      {enriching[event.id] ? "Searching…" : "Find contact"}
                    </button>
                    {!enriching[event.id] && attempted[event.id] && contacts.length === 0 && (
                      <span className="text-xs text-icon-text-light">none found</span>
                    )}
                    {contacts.length > 0 && (
                      <button
                        onClick={() => setOpenEventId(event.id)}
                        className="text-xs text-icon-primary hover:underline"
                      >
                        View {contacts.length} contact{contacts.length > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openEvent && (
        <ContactsModal
          eventName={openEvent.event_name}
          contacts={contactsByEvent[openEvent.id] ?? []}
          onClose={() => setOpenEventId(null)}
        />
      )}
    </div>
  );
}
