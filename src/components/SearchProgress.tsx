"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { handleDiscoveryPollStatus, isDiscoveryTerminal } from "@/lib/discoveryStatus";

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  research: "Searching trusted sources",
  fallback_research: "Checking more sources",
  extraction: "Organizing results",
  validation: "Checking fit and dates",
  persist: "Saving your matches",
  enrichment: "Finding contacts",
  done: "Finished",
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

interface ProgressRun {
  status: string;
  current_stage: string;
  last_completed_stage: string | null;
  stage_summaries: Array<{ stage: string; at?: string }>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export function SearchProgress({
  runId,
  preview,
}: {
  runId: string;
  preview?: ProgressRun;
}) {
  const router = useRouter();
  const [fetchedRun, setFetchedRun] = useState<ProgressRun | null>(null);
  const [clockMs, setClockMs] = useState<number | null>(null);
  const run = preview ?? fetchedRun;
  const status = run?.status;

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (preview) return;
      const res = await fetch(`/api/discover?runId=${encodeURIComponent(runId)}`);
      if (!res.ok || cancelled) return;
      const json = await res.json();
      setFetchedRun(json);
      handleDiscoveryPollStatus(json.status, {
        onTerminal: () => router.refresh(),
        onContinue: () => window.setTimeout(poll, 2500),
      });
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [preview, router, runId]);

  useEffect(() => {
    if (preview || !status || isDiscoveryTerminal(status)) return;
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [preview, status]);

  if (!run) return <p className="animate-enter text-sm text-icon-text-light">Connecting to this search…</p>;
  const started = new Date(run.created_at).getTime();
  const recordedEnd = run.completed_at
    ? new Date(run.completed_at).getTime()
    : new Date(run.stage_summaries.at(-1)?.at ?? run.created_at).getTime();
  const ended = !isDiscoveryTerminal(run.status) && clockMs ? clockMs : recordedEnd;
  const elapsedSec = Math.max(0, Math.round((ended - started) / 1000));
  const recorded = new Set((run.stage_summaries ?? []).map((item) => item.stage));
  if (run.current_stage) recorded.add(run.current_stage);

  const currentIndex = Math.max(0, STAGE_ORDER.indexOf(run.current_stage));

  return (
    <section className="premium-card-dark animate-enter p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#d4ad62]">Searching now</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-.03em]">Finding opportunities for you</h2>
          <p className="mt-1 text-sm text-white/55">You can leave this page—the search will keep running.</p>
        </div>
        <p className="rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-white/70">{elapsedSec}s elapsed</p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="progress-sheen h-full rounded-full bg-gradient-to-r from-[#8f6827] to-[#d6ae61] transition-[width] duration-500"
          style={{ width: `${Math.max(12, ((currentIndex + 1) / STAGE_ORDER.length) * 100)}%` }}
        />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(STAGE_LABELS)
          .filter(([key]) => recorded.has(key) || key === "queued")
          .map(([key, label], index) => {
            const complete = STAGE_ORDER.indexOf(key) < currentIndex || run.status === "completed";
            const active = run.current_stage === key;
            return (
            <li key={key} className={`reveal-card flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${active ? "border-[#d6ae61]/40 bg-white/[.08] font-semibold text-white" : "border-white/[.07] text-white/55"}`} style={{ "--reveal-index": index } as React.CSSProperties}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-[#d6ae61] text-[#041819]" : active ? "bg-white text-[#041819]" : "bg-white/10 text-white/50"}`}>
                {complete ? "✓" : index + 1}
              </span>
              <span>{label}</span>
            </li>
          )})}
      </ol>
      {run.error_message && <p className="mt-3 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-100">We could not finish this search. Any applicable credits were returned.</p>}
    </section>
  );
}
