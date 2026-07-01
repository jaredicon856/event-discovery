import type { EventFilters } from "@/lib/filters";

export function FilterBar({
  filters,
  sectors,
}: {
  filters: EventFilters;
  sectors: string[];
}) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 p-4" action="/" method="GET">
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">Sector</label>
        <select
          name="sector"
          defaultValue={filters.sector ?? ""}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">Tier</label>
        <select
          name="tier"
          defaultValue={filters.tier ?? ""}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="">All tiers</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">Status</label>
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="watch">Watch</option>
          <option value="closed">Closed</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">From</label>
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">To</label>
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        />
      </div>
      <div className="flex flex-1 min-w-[200px] flex-col gap-1">
        <label className="text-xs uppercase text-zinc-500">Search</label>
        <input
          type="text"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="event, city, client fit…"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200"
        />
      </div>
      <button type="submit" className="rounded bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white">
        Apply filters
      </button>
      <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        Clear
      </a>
    </form>
  );
}
