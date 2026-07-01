import type { EventFilters } from "@/lib/filters";
import { SaveListButton } from "@/components/SaveListButton";

const SELECT_CLASS = "rounded border border-icon-border bg-icon-surface px-3 py-1.5 text-sm font-medium text-icon-text";

export function FilterBar({
  filters,
  sectors,
}: {
  filters: EventFilters;
  sectors: string[];
}) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-icon-border p-4" action="/" method="GET">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase text-icon-text-light">Sector</label>
        <select name="sector" defaultValue={filters.sector ?? ""} className={SELECT_CLASS}>
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
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
      <div className="flex flex-1 min-w-[200px] flex-col gap-1">
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
        className="rounded bg-icon-primary px-4 py-1.5 text-sm font-medium text-icon-background hover:brightness-110"
      >
        Apply filters
      </button>
      <a href="/" className="text-sm font-medium text-icon-text-light hover:text-icon-text">
        Clear
      </a>
      <div className="ml-auto">
        <SaveListButton />
      </div>
    </form>
  );
}
