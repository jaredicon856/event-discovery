import Image from "next/image";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyEventFilters, eventsBaseQuery, hasAnyFilter, parseFilters } from "@/lib/filters";
import { FilterBar } from "@/components/FilterBar";
import { EventsTable } from "@/components/EventsTable";
import { IrisExportButton } from "@/components/IrisExportButton";
import type { ContactRecord, EventRecord } from "@/types/event";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") usp.set(key, value);
  }
  const filters = parseFilters(usp);
  const browsingFiltered = hasAnyFilter(filters);
  const viewAll = usp.get("view") === "all";

  let events: EventRecord[] = [];
  let sectors: string[] = [];
  let contactsByEvent: Record<string, ContactRecord[]> = {};
  let latestRunId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseServiceClient();
    const [sectorsRes, latestRunRes] = await Promise.all([
      supabase.from("events").select("sector").order("sector"),
      supabase
        .from("events")
        .select("discovery_run_id")
        .not("discovery_run_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    sectors = Array.from(new Set((sectorsRes.data ?? []).map((r) => r.sector))).sort();
    latestRunId = latestRunRes.data?.discovery_run_id ?? null;

    // Default view (no filters/saved list/explicit "browse all" applied) shows
    // only the most recent discovery run's results, not the full accumulated
    // table — otherwise a fresh search gets buried under everything ever found.
    let eventsRes: { data: EventRecord[] | null; error: unknown };
    if (browsingFiltered || viewAll) {
      eventsRes = await applyEventFilters(eventsBaseQuery(supabase), filters);
    } else if (latestRunId) {
      eventsRes = await applyEventFilters(eventsBaseQuery(supabase), { runId: latestRunId });
    } else {
      eventsRes = { data: [], error: null };
    }

    if (eventsRes.error) throw eventsRes.error;
    events = (eventsRes.data ?? []) as EventRecord[];

    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("*")
        .in("event_id", eventIds);
      if (contactsError) throw contactsError;
      contactsByEvent = (contacts ?? []).reduce<Record<string, ContactRecord[]>>((acc, c) => {
        (acc[c.event_id] ??= []).push(c as ContactRecord);
        return acc;
      }, {});
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "Failed to load events";
  }

  const exportParams = new URLSearchParams(usp);
  if (!browsingFiltered && !viewAll && latestRunId) exportParams.set("runId", latestRunId);
  const exportHref = `/api/export?${exportParams.toString()}`;
  const exportFiltersObj = Object.fromEntries(exportParams.entries());

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Overview</h1>
            <p className="text-sm text-icon-text-light">
              Speaking &amp; networking opportunity database — discovered and enriched by AI agents.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportHref}
              className="rounded border border-icon-primary px-4 py-2 text-sm font-medium text-icon-primary hover:bg-icon-primary-light"
            >
              Export filtered CSV
            </a>
            <IrisExportButton filters={exportFiltersObj} />
          </div>
        </header>

        {errorMessage && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Couldn&apos;t load events: {errorMessage}</p>
            <p className="mt-1 text-amber-700">
              Have you set up your Supabase project and run the migration + env vars yet? See README.md.
            </p>
          </div>
        )}

        <FilterBar filters={filters} sectors={sectors} latestRunId={latestRunId} />

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-icon-text-light">
            {browsingFiltered ? "Filtered results" : viewAll ? "All events" : "Latest search results"}
          </p>
          {!browsingFiltered && !viewAll && (
            <a href="/?view=all" className="text-xs font-medium text-icon-text-light hover:text-icon-text">
              Browse all events instead
            </a>
          )}
          {viewAll && (
            <a href="/" className="text-xs font-medium text-icon-text-light hover:text-icon-text">
              Back to latest search results
            </a>
          )}
        </div>
        <EventsTable events={events} initialContacts={contactsByEvent} />
      </div>
    </div>
  );
}
