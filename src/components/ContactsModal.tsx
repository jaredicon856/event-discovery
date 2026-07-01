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
  low: "bg-zinc-800 text-zinc-400",
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Contacts</h2>
            <p className="text-xs text-zinc-500">{eventName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-zinc-500">No contacts found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {contacts.map((c) => (
              <li key={c.id} className="rounded border border-zinc-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-100">{c.name ?? "Unnamed contact"}</span>
                  {c.confidence && (
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${CONFIDENCE_STYLES[c.confidence] ?? CONFIDENCE_STYLES.low}`}
                    >
                      {c.confidence}
                    </span>
                  )}
                </div>
                {c.title && <p className="mt-0.5 text-xs text-zinc-400">{c.title}</p>}
                <div className="mt-2 flex flex-col gap-1 text-xs">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-sky-400 hover:underline">
                      {c.email}
                    </a>
                  )}
                  {c.phone && <span className="text-zinc-300">{c.phone}</span>}
                  {c.linkedin_url && (
                    <a
                      href={normalizeUrl(c.linkedin_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline"
                    >
                      LinkedIn profile
                    </a>
                  )}
                  {!c.email && !c.phone && !c.linkedin_url && (
                    <span className="text-zinc-600">No direct contact info found</span>
                  )}
                  {c.source_url && (
                    <a
                      href={normalizeUrl(c.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-500 hover:underline"
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
