import type { SupabaseClient } from "@supabase/supabase-js";
import { researchCategory, extractEvents } from "@/lib/agent";
import { enrichAndSaveContacts } from "@/lib/enrichment";
import type { EventRecord } from "@/types/event";

export interface DiscoveryResult {
  inserted: number;
  contactsFound: number;
  citations: string[];
  events: EventRecord[];
  /** Tag shared by every event this run touched — lets the dashboard show "just this search". */
  runId: string;
}

/**
 * Runs one full discovery pass for a sector/query: research the web, extract
 * structured events, save them, then auto-enrich contacts for each. Shared by
 * the manual "Run discovery" button and the scheduled cron job so both go
 * through identical logic.
 */
export async function runDiscovery(
  supabase: SupabaseClient,
  params: { sector: string; query: string }
): Promise<DiscoveryResult> {
  const runId = crypto.randomUUID();
  const { findings, citations } = await researchCategory(params);
  const events = await extractEvents({ findings, sector: params.sector, discoveryQuery: params.query });

  if (events.length === 0) {
    return { inserted: 0, contactsFound: 0, citations, events: [], runId };
  }

  const { data, error } = await supabase
    .from("events")
    .upsert(
      events.map((e) => ({ ...e, discovery_run_id: runId })),
      { onConflict: "event_name,event_start,source_url", ignoreDuplicates: false }
    )
    .select();

  if (error) throw new Error(error.message);

  const savedEvents = (data ?? []) as EventRecord[];
  const contactResults = await Promise.allSettled(
    savedEvents.map((event) => enrichAndSaveContacts(supabase, event))
  );
  const contactsFound = contactResults.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value.length : 0),
    0
  );

  return { inserted: savedEvents.length, contactsFound, citations, events: savedEvents, runId };
}
