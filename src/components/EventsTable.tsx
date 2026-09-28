"use client";

import { useState } from "react";
import type { ContactRecord, EventRecord } from "@/types/event";
import { ContactsModal } from "@/components/ContactsModal";

const TIER_STYLES: Record<string, string> = {
  A: "bg-icon-primary-light text-icon-primary border-icon-primary",
  B: "bg-sky-50 text-sky-700 border-sky-300",
  C: "bg-icon-surface text-icon-text-light border-icon-border",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-red-50 text-red-700",
  watch: "bg-amber-50 text-amber-700",
  unknown: "bg-icon-surface text-icon-text-light",
};

/** Kept in sync with CREDIT_COSTS.enrichment — shown so a click's cost is never a surprise. */
const ENRICHMENT_CREDITS = 20;

/** Agent-extracted URLs sometimes come back without a scheme (e.g. "linkedin.com/in/x"),
 * which browsers then resolve as a path relative to the current site. */
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Some organizers (e.g. a touring conference series) genuinely run one
 * shared CFP hub covering several distinct events — the link isn't wrong,
 * but several identical-looking "link" cells in one table reads as broken
 * without a hint that it's intentional. */
function countBySourceUrl(events: EventRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.source_url) continue;
    counts.set(event.source_url, (counts.get(event.source_url) ?? 0) + 1);
  }
  return counts;
}

export function EventsTable({
  events,
  initialContacts,
  isOwner = false,
  related = false,
}: {
  events: EventRecord[];
  initialContacts: Record<string, ContactRecord[]>;
  isOwner?: boolean;
  related?: boolean;
}) {
  const [enriching, setEnriching] = useState<Record<string, boolean>>({});
  const [contactsByEvent, setContactsByEvent] = useState<Record<string, ContactRecord[]>>(initialContacts);
  const [attempted, setAttempted] = useState<Record<string, boolean>>({});
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<Record<string, string>>({});
  const sourceUrlCounts = countBySourceUrl(events);

  async function enrich(eventId: string, force = false) {
    setEnriching((s) => ({ ...s, [eventId]: true }));
    setEnrichError((s) => ({ ...s, [eventId]: "" }));
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, force, operationKey: crypto.randomUUID() }),
      });
      const json = await res.json();
      if (res.status === 402) {
        setEnrichError((s) => ({
          ...s,
          [eventId]: `Need ${json.required ?? ENRICHMENT_CREDITS} credits (have ${json.balance ?? 0})`,
        }));
        return;
      }
      if (!res.ok) {
        setEnrichError((s) => ({ ...s, [eventId]: json.error ?? "enrichment failed" }));
        return;
      }
      setAttempted((s) => ({ ...s, [eventId]: true }));
      if (Array.isArray(json.contacts) && json.contacts.length > 0) {
        // A cached response returns the contacts already on file rather than
        // appending a fresh (charged) lookup's results.
        setContactsByEvent((s) => ({
          ...s,
          [eventId]: json.cached ? json.contacts : [...(s[eventId] ?? []), ...json.contacts],
        }));
        setOpenEventId(eventId);
      }
    } finally {
      setEnriching((s) => ({ ...s, [eventId]: false }));
    }
  }

  if (events.length === 0) {
    return related ? null : (
      <div className="rounded-xl border border-dashed border-icon-border bg-icon-surface p-7 text-center">
        <p className="font-semibold text-icon-text">No opportunities here yet</p>
        <p className="mt-2 text-sm text-icon-text-light">Start a search or wait for the current search to finish.</p>
      </div>
    );
  }

  const openEvent = events.find((e) => e.id === openEventId);

  return (
    <div className="premium-card overflow-x-auto">
      <table className="w-full min-w-[1100px] table-fixed divide-y divide-icon-border text-sm">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[7%]" />
          <col className="w-[8%]" />
          <col className="w-[5%]" />
          <col className="w-[16%]" />
          <col className="w-[6%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead className="bg-icon-primary-light text-left text-xs font-semibold uppercase tracking-wide text-icon-text-light">
          <tr>
            <th className="px-3 py-2.5">Event</th>
            <th className="px-3 py-2.5">Sector</th>
            <th className="px-3 py-2.5">Dates</th>
            <th className="px-3 py-2.5">Location</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Pitch deadline</th>
            <th className="px-3 py-2.5">Tier</th>
            <th className="px-3 py-2.5">Best fit</th>
            <th className="px-3 py-2.5">Source</th>
            <th className="px-3 py-2.5">Contacts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-icon-border">
          {events.map((event, index) => {
            const contacts = contactsByEvent[event.id] ?? [];
            return (
              <tr
                key={event.id}
                className="reveal-card align-top transition-colors hover:bg-icon-primary-light"
                style={{ "--reveal-index": index } as React.CSSProperties}
              >
                <td className="break-words px-3 py-2.5 font-semibold text-icon-text">
                  {event.event_name}
                  {related && event.mismatch_reasons?.length ? (
                    <p className="mt-1 text-xs font-medium text-icon-text-light">Differs: {event.mismatch_reasons.join(", ").replaceAll("_", " ")}</p>
                  ) : null}
                </td>
                <td className="break-words px-3 py-2.5 font-medium text-icon-text-light">{event.sector}</td>
                <td className="break-words px-3 py-2.5 font-medium text-icon-text-light">
                  {event.date_notes || event.event_start || "—"}
                </td>
                <td className="break-words px-3 py-2.5 font-medium text-icon-text-light">
                  {[event.city, event.state_country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[event.status] ?? STATUS_STYLES.unknown}`}
                  >
                    {event.status}
                  </span>
                </td>
                <td className="break-words px-3 py-2.5 font-medium text-icon-text-light">{event.cfp_deadline || "—"}</td>
                <td className="px-3 py-2.5">
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
                <td className="break-words px-3 py-2.5 font-medium text-icon-text-light">{event.best_client_fit || "—"}</td>
                <td className="px-3 py-2.5">
                  {event.source_url ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <a
                        href={normalizeUrl(event.source_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-icon-primary hover:underline"
                      >
                        link
                      </a>
                      {(sourceUrlCounts.get(event.source_url) ?? 0) > 1 && (
                        <span
                          className="text-xs text-icon-text-light"
                          title="This organizer runs one shared page covering multiple events — the same link is correct for each."
                        >
                          shared page
                        </span>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col items-start gap-1.5">
                    {contacts.length > 0 ? (
                      <>
                        <button
                          onClick={() => setOpenEventId(event.id)}
                          className="cursor-pointer rounded border border-icon-border px-2 py-1 text-xs font-medium text-icon-text hover:border-icon-primary hover:bg-icon-primary-light"
                        >
                          View {contacts.length} contact{contacts.length > 1 ? "s" : ""}
                        </button>
                        <button
                          onClick={() => enrich(event.id, true)}
                          disabled={enriching[event.id]}
                          title={isOwner ? "Runs a fresh unbilled owner search" : `Runs a fresh search and costs ${ENRICHMENT_CREDITS} credits`}
                          className="cursor-pointer text-xs font-medium text-icon-text-light hover:text-icon-text disabled:opacity-50"
                        >
                          {enriching[event.id]
                            ? "Searching…"
                            : isOwner ? "Search again · Unbilled" : `Search again · ${ENRICHMENT_CREDITS} credits`}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          if (related && !window.confirm("This suggestion differs from your search. Finding contacts will use credits. Continue?")) {
                            return;
                          }
                          void enrich(event.id);
                        }}
                        disabled={enriching[event.id]}
                        title={isOwner ? "Recorded as unbilled owner usage" : `Costs ${ENRICHMENT_CREDITS} credits`}
                        className="cursor-pointer rounded border border-icon-border px-2 py-1 text-xs font-medium text-icon-text hover:border-icon-primary hover:bg-icon-primary-light disabled:opacity-50"
                      >
                        {enriching[event.id]
                          ? "Searching…"
                          : isOwner ? "Find contact · Unbilled" : `Find contact · ${ENRICHMENT_CREDITS} credits`}
                      </button>
                    )}
                    {enrichError[event.id] && (
                      <span className="text-xs font-medium text-red-700">{enrichError[event.id]}</span>
                    )}
                    {!enriching[event.id] && attempted[event.id] && contacts.length === 0 && !enrichError[event.id] && (
                      <span className="text-xs font-medium text-icon-text-light">none found</span>
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
