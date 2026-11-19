if (typeof window !== "undefined") {
  throw new Error("src/lib/privacyRequests.ts must not be imported from a Client Component module.");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessProfile } from "@/lib/access";

/** Everything we hold about this one customer, in a readable file. Internal cost fields are left out. */
export async function buildDataExport(service: SupabaseClient, profile: AccessProfile) {
  const id = profile.id;
  const pick = async (table: string, columns: string, order = "created_at") => {
    const { data, error } = await service.from(table).select(columns).eq("profile_id", id).order(order, { ascending: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  };

  const [runs, lists, schedules, ledger, subscriptions, consents, unlocks] = await Promise.all([
    pick("discovery_runs", "id, sector, query, criteria, status, events_found, credits_charged, credits_refunded, started_at, completed_at, created_at"),
    pick("saved_lists", "id, name, sector, tier, status, from_date, to_date, q, created_at"),
    pick("discovery_schedules", "id, sector, query, enabled, last_run_at, created_at"),
    pick("credit_ledger", "id, delta, reason, note, balance_bucket, created_at, expires_at"),
    pick("subscriptions", "plan, status, billing_interval, credits_per_cycle, current_period_start, current_period_end, cancel_at_period_end, created_at"),
    pick("legal_consents", "version, source, accepted_at", "accepted_at"),
    pick("customer_event_contacts", "event_id, contact_id, discovery_run_id, created_at"),
  ]);

  const runIds = runs.map((run) => (run as unknown as { id: string }).id);
  const { data: runEvents } = runIds.length
    ? await service.from("discovery_run_events").select("discovery_run_id, event_id, match_kind").in("discovery_run_id", runIds)
    : { data: [] };
  const eventIds = [...new Set((runEvents ?? []).map((row) => row.event_id as string))];
  const contactIds = [...new Set(unlocks.map((row) => (row as unknown as { contact_id: string }).contact_id))];

  const { data: events } = eventIds.length
    ? await service
        .from("events")
        .select("id, event_name, event_start, event_end, city, state_country, sector, opportunity_type, source_url, status")
        .in("id", eventIds)
    : { data: [] };
  const { data: contacts } = contactIds.length
    ? await service.from("contacts").select("id, event_id, name, title, email, phone, linkedin_url, source_url").in("id", contactIds)
    : { data: [] };

  return {
    exported_at: new Date().toISOString(),
    note: "This file contains the personal information Event Scout holds about your account.",
    profile: {
      email: profile.email,
      full_name: profile.full_name,
      display_name: profile.display_name,
      company: profile.company,
      job_title: profile.job_title,
      timezone: profile.timezone,
    },
    subscriptions,
    credit_history: ledger,
    searches: runs,
    saved_lists: lists,
    schedules,
    opportunities_in_your_searches: events ?? [],
    organizer_contacts_you_unlocked: contacts ?? [],
    terms_accepted: consents,
  };
}
