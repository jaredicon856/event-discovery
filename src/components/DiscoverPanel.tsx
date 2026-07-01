"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DiscoverPanel() {
  const router = useRouter();
  const [sector, setSector] = useState("");
  const [query, setQuery] = useState("");
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
      } else {
        const contactsMsg =
          json.inserted > 0 ? ` Found ${json.contactsFound ?? 0} contact(s) across them.` : "";
        setResult(`Found and saved ${json.inserted} event(s).${contactsMsg}`);
        router.refresh();
      }
    } catch {
      setResult("Error: request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={runDiscovery} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">Sector</label>
        <input
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="e.g. Healthcare"
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        />
      </div>
      <div className="flex flex-1 min-w-[240px] flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">Search focus</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. call for speakers hospital executive conference 2026"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? "Searching + finding contacts…" : "Run discovery"}
      </button>
      {result && <p className="text-sm text-zinc-400">{result}</p>}
    </form>
  );
}
