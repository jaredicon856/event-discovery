import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyEventFilters, eventsBaseQuery, parseFilters } from "@/lib/filters";
import { FilterBar } from "@/components/FilterBar";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { SchedulesPanel } from "@/components/SchedulesPanel";
import { EventsTable } from "@/components/EventsTable";
import type { ContactRecord, DiscoveryScheduleRecord, EventRecord } from "@/types/event";

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

  let events: EventRecord[] = [];
  let sectors: string[] = [];
  let contactsByEvent: Record<string, ContactRecord[]> = {};
  let schedules: DiscoveryScheduleRecord[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseServiceClient();
    const [eventsRes, sectorsRes, schedulesRes] = await Promise.all([
      applyEventFilters(eventsBaseQuery(supabase), filters),
      supabase.from("events").select("sector").order("sector"),
      supabase.from("discovery_schedules").select("*").order("created_at", { ascending: false }),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    events = (eventsRes.data ?? []) as EventRecord[];
    sectors = Array.from(new Set((sectorsRes.data ?? []).map((r) => r.sector))).sort();
    if (schedulesRes.error) throw schedulesRes.error;
    schedules = (schedulesRes.data ?? []) as DiscoveryScheduleRecord[];

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

  const exportHref = `/api/export?${usp.toString()}`;

  return (
    <div className="min-h-screen bg-black px-6 py-10 text-zinc-100 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Event Scout</h1>
            <p className="text-sm text-zinc-500">
              Speaking &amp; networking opportunity database — discovered and enriched by AI agents.
            </p>
          </div>
          <a
            href={exportHref}
            className="rounded border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
          >
            Export filtered CSV
          </a>
        </header>

        {errorMessage && (
          <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-300">
            <p className="font-medium">Couldn&apos;t load events: {errorMessage}</p>
            <p className="mt-1 text-amber-400/80">
              Have you set up your Supabase project and run the migration + env vars yet? See README.md.
            </p>
          </div>
        )}

        <DiscoverPanel />
        <SchedulesPanel schedules={schedules} />
        <FilterBar filters={filters} sectors={sectors} />
        <EventsTable events={events} initialContacts={contactsByEvent} />
      </div>
    </div>
  );
}
