"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SaveListButton({ latestRunId }: { latestRunId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const urlHasFilter = ["sector", "tier", "status", "from", "to", "q"].some((key) =>
    Boolean(searchParams.get(key))
  );
  // With no filters in the URL, we're viewing the latest discovery run by
  // default — saving in that state should capture that run, not nothing.
  const canSave = urlHasFilter || Boolean(latestRunId);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/saved-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sector: searchParams.get("sector") || undefined,
          tier: searchParams.get("tier") || undefined,
          status: searchParams.get("status") || undefined,
          from: searchParams.get("from") || undefined,
          to: searchParams.get("to") || undefined,
          q: searchParams.get("q") || undefined,
          runId: urlHasFilter ? searchParams.get("runId") || undefined : latestRunId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${json.error ?? "failed to save"}`);
        return;
      }
      setName("");
      setShowInput(false);
      router.refresh();
    } catch {
      setMessage("Error: request failed");
    } finally {
      setSaving(false);
    }
  }

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setShowInput(true)}
        disabled={!canSave}
        title={canSave ? undefined : "Apply a filter or run a search first"}
        className="rounded border border-icon-border px-3 py-1.5 text-sm font-medium text-icon-text-light hover:bg-icon-surface disabled:opacity-40"
      >
        Save as list
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        placeholder="List name…"
        className="rounded border border-icon-border bg-icon-surface px-3 py-1.5 text-sm font-medium text-icon-text"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !name.trim()}
        className="rounded bg-icon-primary px-3 py-1.5 text-sm font-medium text-icon-background hover:brightness-110 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setShowInput(false)}
        className="text-sm font-medium text-icon-text-light hover:text-icon-text"
      >
        Cancel
      </button>
      {message && <span className="text-xs font-medium text-icon-text-light">{message}</span>}
    </div>
  );
}
