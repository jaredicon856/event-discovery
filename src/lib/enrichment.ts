import type { SupabaseClient } from "@supabase/supabase-js";
import { findEventContacts } from "@/lib/agent";
import type { ContactRecord } from "@/types/event";

/**
 * Runs the contact-finding agent for one event and persists any results.
 * Shared by the manual "Find contact" button and discovery's auto-enrich pass
 * so both go through identical logic.
 */
export async function enrichAndSaveContacts(
  supabase: SupabaseClient,
  event: { id: string; event_name: string; source_url: string | null; booking_path: string | null }
): Promise<ContactRecord[]> {
  const contacts = await findEventContacts({
    eventName: event.event_name,
    sourceUrl: event.source_url,
    bookingPath: event.booking_path,
  });

  if (contacts.length === 0) return [];

  const { data, error } = await supabase
    .from("contacts")
    .insert(contacts.map((c) => ({ ...c, event_id: event.id, found_via: "agent_search" })))
    .select();

  if (error) throw new Error(error.message);
  return (data ?? []) as ContactRecord[];
}
