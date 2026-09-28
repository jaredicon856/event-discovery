import type { SupabaseClient } from "@supabase/supabase-js";
import { findEventContacts } from "@/lib/agent";
import { recordAiUsage } from "@/lib/aiUsage";
import { CREDIT_COSTS } from "@/lib/credits";
import type { ContactRecord } from "@/types/event";

/**
 * Runs the contact-finding agent for one event and persists any results.
 * Shared by the manual "Find contact" button and discovery's auto-enrich pass
 * so both go through identical logic.
 */
export async function enrichAndSaveContacts(
  supabase: SupabaseClient,
  event: { id: string; event_name: string; source_url: string | null; booking_path: string | null },
  context?: {
    profileId?: string;
    discoveryRunId?: string;
    billingMode?: "customer_credits" | "owner_unbilled";
  }
): Promise<ContactRecord[]> {
  const { contacts, usage } = await findEventContacts({
    eventName: event.event_name,
    sourceUrl: event.source_url,
    bookingPath: event.booking_path,
  });

  await recordAiUsage(supabase, {
    action: "enrichment",
    usage,
    creditsCharged:
      context?.profileId && context.billingMode !== "owner_unbilled"
        ? CREDIT_COSTS.enrichment
        : 0,
    billingMode: context?.billingMode,
    profileId: context?.profileId,
    relatedEventId: event.id,
    discoveryRunId: context?.discoveryRunId,
  });

  // discovery_runs.estimated_cost_usd only ever tracked research/extraction
  // cost, never contact-enrichment cost — a run's own cost field silently
  // undercounted real spend whenever contacts were also researched (found in
  // review, 24 Sep 2026: $0.17 tracked vs $0.76 real on one run). Contact
  // lookups run concurrently, so this must be atomic, not a client-side
  // read-modify-write.
  if (context?.discoveryRunId) {
    const { error: rollupError } = await supabase.rpc("increment_discovery_run_cost", {
      p_run_id: context.discoveryRunId,
      p_amount: usage.estimatedCostUsd,
    });
    if (rollupError) throw new Error(rollupError.message);
  }

  if (contacts.length === 0) return [];

  // A re-run can surface people already on file. Drop those so repeat searches
  // don't stack duplicate rows on the event's contact list.
  const { data: existing } = await supabase
    .from("contacts")
    .select("*")
    .eq("event_id", event.id);

  const contactKey = (contact: { email?: string | null; name?: string | null }) =>
    (contact.email ?? contact.name ?? "").trim().toLowerCase();
  const seen = new Set(
    (existing ?? []).map(contactKey).filter(Boolean)
  );
  const fresh = contacts.filter((c) => {
    const key = contactKey(c);
    return key ? !seen.has(key) : true;
  });

  let inserted: ContactRecord[] = [];
  if (fresh.length > 0) {
    const { data, error } = await supabase
      .from("contacts")
      .insert(fresh.map((c) => ({ ...c, event_id: event.id, found_via: "agent_search" })))
      .select();
    if (error) throw new Error(error.message);
    inserted = (data ?? []) as ContactRecord[];
  }

  const returnedKeys = new Set(contacts.map(contactKey).filter(Boolean));
  const matchedExisting = (existing ?? []).filter((contact) =>
    returnedKeys.has(contactKey(contact))
  ) as ContactRecord[];
  const results = [...matchedExisting, ...inserted];
  if (context?.profileId && results.length > 0) {
    const { error: ownershipError } = await supabase
      .from("customer_event_contacts")
      .upsert(
        results.map((contact) => ({
          profile_id: context.profileId,
          event_id: event.id,
          contact_id: contact.id,
          discovery_run_id: context.discoveryRunId ?? null,
        })),
        { onConflict: "profile_id,event_id,contact_id" }
      );
    if (ownershipError) throw new Error(ownershipError.message);
  }
  return results;
}
