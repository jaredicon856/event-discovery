"use client";

import { useEffect } from "react";
import type { ContactRecord } from "@/types/event";

/** Agent-extracted URLs sometimes come back without a scheme (e.g. "linkedin.com/in/x"),
 * which browsers then resolve as a path relative to the current site. */
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-900/40 text-emerald-300",
  medium: "bg-amber-900/40 text-amber-300",
  low: "bg-icon-surface text-icon-text-light",
};

export function ContactsModal({
  eventName,
  contacts,
  onClose,
}: {
  eventName: string;
  contacts: ContactRecord[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-icon-blur p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-icon-border bg-icon-background p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-icon-text">Contacts</h2>
            <p className="text-xs text-icon-text-light">{eventName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-icon-border px-2 py-1 text-xs text-icon-text-light hover:bg-icon-surface"
          >
            Close
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-icon-text-light">No contacts found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {contacts.map((c) => (
              <li key={c.id} className="rounded border border-icon-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-icon-text">{c.name ?? "Unnamed contact"}</span>
                  {c.confidence && (
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${CONFIDENCE_STYLES[c.confidence] ?? CONFIDENCE_STYLES.low}`}
                    >
                      {c.confidence}
                    </span>
                  )}
                </div>
                {c.title && <p className="mt-0.5 text-xs text-icon-text-light">{c.title}</p>}
                <div className="mt-2 flex flex-col gap-1 text-xs">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-icon-primary hover:underline">
                      {c.email}
                    </a>
                  )}
                  {c.phone && <span className="text-icon-text">{c.phone}</span>}
                  {c.linkedin_url && (
                    <a
                      href={normalizeUrl(c.linkedin_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-icon-primary hover:underline"
                    >
                      LinkedIn profile
                    </a>
                  )}
                  {!c.email && !c.phone && !c.linkedin_url && (
                    <span className="text-icon-text-light">No direct contact info found</span>
                  )}
                  {c.source_url && (
                    <a
                      href={normalizeUrl(c.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-icon-text-light hover:underline"
                    >
                      source
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
