import type { SupabaseClient } from "@supabase/supabase-js";
import { applyEventFilters, type EventFilters } from "@/lib/filters";
import type { SavedListRecord } from "@/types/event";

export function savedListToFilters(row: SavedListRecord): EventFilters {
  return {
    sector: row.sector ?? undefined,
    tier: row.tier ?? undefined,
    status: row.status ?? undefined,
    from: row.from_date ?? undefined,
    to: row.to_date ?? undefined,
    q: row.q ?? undefined,
    runId: row.discovery_run_id ?? undefined,
  };
}

/** Fetches all saved lists along with a live count of events each currently matches. */
export async function getSavedListsWithCounts(
  supabase: SupabaseClient,
  profileId: string
): Promise<SavedListRecord[]> {
  const { data, error } = await supabase
    .from("saved_lists")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const lists = (data ?? []) as SavedListRecord[];
  const { data: runs } = await supabase
    .from("discovery_runs")
    .select("id")
    .eq("profile_id", profileId)
    .eq("run_kind", "customer");
  const runIds = (runs ?? []).map((run) => run.id);
  const { data: eventLinks } = runIds.length
    ? await supabase
        .from("discovery_run_events")
        .select("event_id")
        .in("discovery_run_id", runIds)
    : { data: [] };
  const eventIds = [...new Set((eventLinks ?? []).map((link) => link.event_id))];
  return Promise.all(
    lists.map(async (list) => {
      if (eventIds.length === 0) return { ...list, eventCount: 0 };
      const query = applyEventFilters(
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .in("id", eventIds),
        { ...savedListToFilters(list), runId: undefined }
      );
      const { count } = await query;
      return { ...list, eventCount: count ?? 0 };
    })
  );
}
