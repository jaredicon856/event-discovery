"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DiscoverPanel() {
  const router = useRouter();
  const [sector, setSector] = useState("");
  const [query, setQuery] = useState("");
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runDiscovery(e: React.FormEvent) {
    e.preventDefault();
    if (!sector || !query) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector, query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult(`Error: ${json.error ?? "discovery failed"}`);
        return;
      }

      const contactsMsg =
        json.inserted > 0 ? ` Found ${json.contactsFound ?? 0} contact(s) across them.` : "";
      let scheduleMsg = "";
      if (repeatDaily) {
        const scheduleRes = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sector, query }),
        });
        scheduleMsg = scheduleRes.ok
          ? " Saved as a daily scheduled search."
          : " (Failed to save as a daily schedule.)";
      }

      setResult(`Found and saved ${json.inserted} event(s).${contactsMsg}${scheduleMsg}`);
      router.refresh();
    } catch {
      setResult("Error: request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={runDiscovery} className="flex flex-wrap items-end gap-3 rounded-lg border border-icon-border p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Sector</label>
        <input
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="e.g. Healthcare"
          className="rounded border border-icon-border bg-icon-surface px-3 py-1.5 text-sm font-medium text-icon-text"
        />
      </div>
      <div className="flex flex-1 min-w-[240px] flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Search focus</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. call for speakers hospital executive conference 2026"
          className="w-full rounded border border-icon-border bg-icon-surface px-3 py-1.5 text-sm font-medium text-icon-text"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-xs font-medium text-icon-text-light">
        <input
          type="checkbox"
          checked={repeatDaily}
          onChange={(e) => setRepeatDaily(e.target.checked)}
          className="h-3.5 w-3.5 accent-icon-primary"
        />
        Repeat this search daily
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-icon-primary px-4 py-1.5 text-sm font-medium text-icon-background hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Searching + finding contacts…" : "Run discovery"}
      </button>
      {result && <p className="text-sm font-medium text-icon-text-light">{result}</p>}
    </form>
  );
}
