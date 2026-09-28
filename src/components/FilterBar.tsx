import Link from "next/link";
import type { EventFilters } from "@/lib/filters";
import { SECTOR_CATALOGUE } from "@/lib/searchCriteria";
import { SaveListButton } from "@/components/SaveListButton";

const SELECT_CLASS = "min-h-11 rounded-lg border border-icon-border bg-icon-surface px-3 text-sm font-medium text-icon-text outline-none focus:border-icon-primary focus:ring-2 focus:ring-icon-primary/20";

export function FilterBar({
  filters,
  latestRunId,
  allowSave = true,
  viewAll = false,
}: {
  filters: EventFilters;
  latestRunId: string | null;
  allowSave?: boolean;
  /** Browsing every saved opportunity across all past searches, not just one run. */
  viewAll?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        {viewAll ? (
          <>
            <span className="font-medium text-icon-text-light">Browsing all your saved opportunities</span>
            <Link href="/opportunities?tab=results" className="font-semibold text-icon-primary hover:underline">
              ← Back to latest search
            </Link>
          </>
        ) : (
          <>
            <span />
            <Link href="/opportunities?tab=results&view=all" className="font-semibold text-icon-primary hover:underline">
              Browse all your opportunities →
            </Link>
          </>
        )}
      </div>
      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-icon-border bg-icon-surface p-3 shadow-sm" action="/opportunities" method="GET">
      <input type="hidden" name="tab" value="results" />
      {viewAll ? (
        <input type="hidden" name="view" value="all" />
      ) : (
        filters.runId && <input type="hidden" name="runId" value={filters.runId} />
      )}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Sector</label>
        <select name="sector" defaultValue={filters.sector ?? ""} className={SELECT_CLASS}>
          <option value="">All sectors</option>
          {SECTOR_CATALOGUE.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Tier</label>
        <select name="tier" defaultValue={filters.tier ?? ""} className={SELECT_CLASS}>
          <option value="">All tiers</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Status</label>
        <select name="status" defaultValue={filters.status ?? ""} className={SELECT_CLASS}>
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="watch">Watch</option>
          <option value="closed">Closed</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">From</label>
        <input type="date" name="from" defaultValue={filters.from ?? ""} className={SELECT_CLASS} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">To</label>
        <input type="date" name="to" defaultValue={filters.to ?? ""} className={SELECT_CLASS} />
      </div>
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Search</label>
        <input
          type="text"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="event, city, client fit…"
          className={`w-full ${SELECT_CLASS}`}
        />
      </div>
      <button
        type="submit"
        className="min-h-11 cursor-pointer rounded-lg bg-icon-primary px-4 text-sm font-semibold text-white transition-[filter] duration-200 hover:brightness-105"
      >
        Apply filters
      </button>
      <Link
        href={
          viewAll
            ? "/opportunities?tab=results&view=all"
            : filters.runId
              ? `/opportunities?runId=${filters.runId}`
              : "/opportunities"
        }
        className="text-sm font-medium text-icon-text-light hover:text-icon-text"
      >
        Clear
      </Link>
      {allowSave && (
      <div className="ml-auto">
        <SaveListButton latestRunId={latestRunId} />
      </div>
      )}
      </form>
    </div>
  );
}
