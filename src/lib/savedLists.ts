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
export async function getSavedListsWithCounts(supabase: SupabaseClient): Promise<SavedListRecord[]> {
  const { data, error } = await supabase
    .from("saved_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const lists = (data ?? []) as SavedListRecord[];
  return Promise.all(
    lists.map(async (list) => {
      const query = applyEventFilters(
        supabase.from("events").select("id", { count: "exact", head: true }),
        savedListToFilters(list)
      );
      const { count } = await query;
      return { ...list, eventCount: count ?? 0 };
    })
  );
}
