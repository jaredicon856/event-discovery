"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  OPPORTUNITY_TYPES,
  SECTOR_CATALOGUE,
  buildResearchQuery,
  buildResearchSummary,
  defaultDateWindow,
  type OpportunityTypeId,
} from "@/lib/searchCriteria";
import { canStartDiscovery } from "@/lib/credits";
import { trialDaysLeftLabel } from "@/lib/trial";

export function DiscoverPanel({
  canSchedule,
  defaultContactLimit,
  maxContactLookups,
  trialSearchRemaining,
  trialDaysLeft = null,
  nonTrialCredits,
  isOwner,
}: {
  canSchedule: boolean;
  defaultContactLimit: number;
  maxContactLookups: number;
  trialSearchRemaining?: number;
  trialDaysLeft?: number | null;
  nonTrialCredits: number;
  isOwner: boolean;
}) {
  const router = useRouter();
  const defaults = defaultDateWindow();
  const [mode, setMode] = useState<"guided" | "custom">("guided");
  const [sectors, setSectors] = useState<string[]>(["healthcare"]);
  const [location, setLocation] = useState("United States, Canada");
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [types, setTypes] = useState<OpportunityTypeId[]>(["conference", "podcast"]);
  const [expertise, setExpertise] = useState("");
  const [audience, setAudience] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [summaryOverride, setSummaryOverride] = useState("");
  const [maxAutoContactLookups, setMaxAutoContactLookups] = useState(defaultContactLimit);
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const generatedSummary = useMemo(
    () =>
      buildResearchSummary({
        sectors,
        location,
        dateFrom,
        dateTo,
        types,
        expertise,
        audience,
      }),
    [sectors, location, dateFrom, dateTo, types, expertise, audience]
  );
  const query = mode === "custom" ? customQuery.trim() : (summaryOverride.trim() || generatedSummary);
  const sector = sectors[0] ?? "other";
  const creditCap = 20 + maxAutoContactLookups * 20;
  const hasDiscoveryAccess =
    isOwner || canStartDiscovery(nonTrialCredits, trialSearchRemaining ?? 0);
  // Empty sectors/types don't crash — the validator just treats an empty
  // list as "no restriction" — but that's surprising, not what someone means
  // by deselecting every preset button. Only guided mode exposes these
  // toggles, so only require it there.
  const missingPresetSelection = mode === "guided" && (sectors.length === 0 || types.length === 0);

  function toggleSector(id: string) {
    setSectors((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleType(id: OpportunityTypeId) {
    setTypes((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function runDiscovery(e: React.FormEvent) {
    e.preventDefault();
    if (!sector || !query) return;
    setLoading(true);
    setResult(null);
    try {
      const operationKey = crypto.randomUUID();
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector,
          query,
          sectors,
          location,
          dateFrom,
          dateTo,
          types,
          expertise,
          audience,
          customQuery: mode === "custom" ? customQuery : query,
          maxAutoContactLookups,
          operationKey,
        }),
      });
      const json = await res.json();
      if (res.status === 402) {
        setResult(`Not enough credits (have ${json.balance ?? 0}, need ${json.required ?? 1}). Buy a plan on Billing.`);
        return;
      }
      if (!res.ok) {
        setResult(`Error: ${json.error ?? "discovery failed"}`);
        return;
      }
      if (repeatDaily) {
        await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sector, query, maxAutoContactLookups }),
        });
      }
      router.push(`/opportunities?tab=results&runId=${encodeURIComponent(json.runId)}`);
      router.refresh();
    } catch {
      setResult("Error: request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={runDiscovery} className="premium-card animate-enter overflow-hidden">
      <div className="border-b border-icon-border bg-[linear-gradient(120deg,rgba(184,137,50,.1),transparent_45%)] px-5 py-5 sm:px-6">
        <p className="premium-eyebrow">New search</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">What opportunities should we find?</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-icon-text-light">
              Tell us what you need. Strong matches appear first, with other useful options shown separately.
            </p>
          </div>
          <div className="flex rounded-full border border-icon-border bg-icon-background/60 p-1">
        <button type="button" onClick={() => setMode("guided")} className={`min-h-10 cursor-pointer rounded-full px-4 text-sm font-semibold transition-all ${mode === "guided" ? "bg-icon-primary text-white shadow-sm" : "text-icon-text-light hover:text-icon-text"}`}>
          Guided search
        </button>
        <button type="button" onClick={() => setMode("custom")} className={`min-h-10 cursor-pointer rounded-full px-4 text-sm font-semibold transition-all ${mode === "custom" ? "bg-icon-primary text-white shadow-sm" : "text-icon-text-light hover:text-icon-text"}`}>
          Custom search
        </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6 p-5 sm:p-6">
      {mode === "guided" ? (
        <>
          <fieldset>
            <legend className="flex items-center gap-3 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-icon-primary text-xs text-white">1</span>Choose your sectors</legend>
            <p className="mt-2 pl-10 text-sm text-icon-text-light">Choose the industries you want to reach.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SECTOR_CATALOGUE.map((item) => (
                <label key={item.id} className={`min-h-11 cursor-pointer rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${sectors.includes(item.id) ? "border-icon-primary bg-icon-primary-light text-icon-text shadow-[inset_0_0_0_1px_rgba(184,137,50,.08)]" : "border-icon-border bg-icon-surface hover:border-icon-primary/60"}`}>
                  <input type="checkbox" className="sr-only" checked={sectors.includes(item.id)} onChange={() => toggleSector(item.id)} />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-icon-primary text-xs text-white">2</span><p className="text-sm font-semibold">Set the search boundaries</p></div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">Location</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, region, or remote" className="premium-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">From</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="premium-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">To</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="premium-input" />
            </label>
          </div>
          </div>
          <fieldset>
            <legend className="flex items-center gap-3 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-icon-primary text-xs text-white">3</span>Opportunity types</legend>
            <div className="mt-4 flex flex-wrap gap-2">
              {OPPORTUNITY_TYPES.map((item) => (
                <label key={item.id} className={`min-h-11 cursor-pointer rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${types.includes(item.id) ? "border-icon-primary bg-icon-primary-light" : "border-icon-border hover:border-icon-primary/60"}`}>
                  <input type="checkbox" className="sr-only" checked={types.includes(item.id)} onChange={() => toggleType(item.id)} />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">Expertise / topic</span>
              <input value={expertise} onChange={(e) => setExpertise(e.target.value)} placeholder="e.g. Healthcare transformation" className="premium-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">Target audience</span>
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Hospital executives" className="premium-input" />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">Search description</span>
            <textarea value={summaryOverride || generatedSummary} onChange={(e) => setSummaryOverride(e.target.value)} rows={3} className="premium-input min-h-28 py-3 leading-6" />
          </label>
        </>
      ) : (
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold uppercase text-icon-text-light">Custom search</span>
          <textarea value={customQuery} onChange={(e) => setCustomQuery(e.target.value)} placeholder={`Example: ${buildResearchQuery({ sectors: ["healthcare"], location: "", dateFrom: defaults.dateFrom, dateTo: defaults.dateTo, types: ["conference"], expertise: "hospital executives", audience: "" })}`} rows={5} className="premium-input min-h-40 py-3 leading-6" />
          <span className="text-xs text-icon-text-light">Very narrow searches may return no matches. A completed search still uses credits.</span>
        </label>
      )}

        </div>
        <aside className="border-t border-icon-border bg-[#f1ede3] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="lg:sticky lg:top-8">
            <p className="premium-eyebrow">Search estimate</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-.05em]">{creditCap}</p>
            <p className="mt-1 text-sm text-icon-text-light">most this search will use</p>
            {sectors.length > 1 && types.length > 1 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Broad searches (multiple sectors and opportunity types at once) need deeper research and can take
                longer. Credit cost stays the same either way — if this search can&apos;t finish everything in one
                pass, we&apos;ll do a second research pass automatically rather than return an incomplete set.
              </p>
            )}
            <div className="mt-5 grid gap-3 border-y border-icon-border py-4 text-sm">
              <div className="flex items-center justify-between"><span className="text-icon-text-light">Opportunity search</span><strong>20</strong></div>
              <div className="flex items-center justify-between"><span className="text-icon-text-light">Contact searches</span><strong>{maxAutoContactLookups}</strong></div>
              <div className="flex items-center justify-between"><span className="text-icon-text-light">Other suggestions</span><strong>Contacts not included</strong></div>
            </div>
      <div className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[.1em] text-icon-text-light">Contact lookups</span>
          <select id="contact-limit" value={maxAutoContactLookups} onChange={(event) => setMaxAutoContactLookups(Number(event.target.value))} className="premium-input">
            {[0, 1, 2, 3, 5, 7, 10].filter((value) => value <= maxContactLookups).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        {canSchedule ? (
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-icon-border bg-white/60 px-3 text-xs font-medium text-icon-text-light">
            <input type="checkbox" checked={repeatDaily} onChange={(e) => setRepeatDaily(e.target.checked)} className="h-4 w-4 accent-icon-primary" />
            Repeat this search daily
          </label>
        ) : (
          <p className="text-xs text-icon-text-light">Scheduling is available on paid plans.</p>
        )}
        <button
          type="submit"
          disabled={loading || !hasDiscoveryAccess || missingPresetSelection}
          className="premium-button w-full bg-icon-primary text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Starting search…" : !hasDiscoveryAccess ? "Plan required" : "Find opportunities"}
        </button>
        {missingPresetSelection && (
          <p className="text-xs font-medium text-amber-700">Choose at least one sector and one opportunity type.</p>
        )}
      </div>
      {!hasDiscoveryAccess && (
        <p className="rounded-lg border border-icon-primary/30 bg-icon-primary-light px-4 py-3 text-sm">
          Your free search has been used.{" "}
          <Link href="/billing" className="font-semibold text-icon-primary underline underline-offset-2">Choose a paid plan</Link>
        </p>
      )}
      {result && <p className="text-sm font-medium text-icon-text-light">{result}</p>}
      <p className="text-xs leading-5 text-icon-text-light">
        {isOwner
          ? `Owner account: this search does not use credits. Up to ${maxAutoContactLookups} contact searches can run automatically.`
          : `This search can use up to ${creditCap} credits: 20 for opportunities and 20 for each selected contact search. Other suggestions will not use contact credits unless you choose them.`}
      </p>
      {isOwner ? null : trialSearchRemaining !== undefined && (
        <p className="text-xs font-semibold text-icon-primary">
          {trialDaysLeft === 0
            ? "Your free trial has expired."
            : `Free trial: ${trialSearchRemaining} opportunity search remaining${trialDaysLeft ? ` · ${trialDaysLeftLabel(trialDaysLeft)}` : ""}.`}
        </p>
      )}
          </div>
        </aside>
      </div>
    </form>
  );
}
