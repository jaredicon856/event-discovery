import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventFilters {
  sector?: string;
  tier?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  /** Restricts to events tagged with a specific discovery run (see lib/discovery.ts). */
  runId?: string;
}

export function parseFilters(searchParams: URLSearchParams): EventFilters {
  return {
    sector: searchParams.get("sector") ?? undefined,
    tier: searchParams.get("tier") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    runId: searchParams.get("runId") ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEventFilters(query: any, filters: EventFilters) {
  if (filters.sector) query = query.eq("sector", filters.sector);
  if (filters.tier) query = query.eq("visibility_tier", filters.tier);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("event_start", filters.from);
  if (filters.to) query = query.lte("event_start", filters.to);
  if (filters.runId) query = query.eq("discovery_run_id", filters.runId);
  if (filters.q) {
    query = query.or(
      `event_name.ilike.%${filters.q}%,city.ilike.%${filters.q}%,best_client_fit.ilike.%${filters.q}%`
    );
  }
  return query;
}

export function eventsBaseQuery(supabase: SupabaseClient) {
  return supabase.from("events").select("*").order("event_start", { ascending: true, nullsFirst: false });
}

/** A list with no filter criteria at all would match/delete every event — never allowed. */
export function hasAnyFilter(filters: EventFilters): boolean {
  return Boolean(
    filters.sector || filters.tier || filters.status || filters.from || filters.to || filters.q || filters.runId
  );
}
