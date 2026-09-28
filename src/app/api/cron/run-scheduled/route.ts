import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { processQueuedDiscoveryJobs, runDiscovery } from "@/lib/discovery";
import { assertVercelCronAuthorized, UnauthorizedError } from "@/lib/auth";
import { canScheduleSearch } from "@/lib/credits";
import { isToolEnabled } from "@/lib/featureFlags";

export const maxDuration = 300;

interface ScheduleRow {
  id: string;
  sector: string;
  query: string;
  profile_id: string;
  max_auto_contact_lookups: number;
  profiles:
    | { role: string; access_status: string }
    | Array<{ role: string; access_status: string }>;
}

export async function GET(request: NextRequest) {
  try {
    assertVercelCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const supabase = getSupabaseServiceClient();
  await supabase.rpc("recover_stale_credit_operations", {
    p_older_than: "30 minutes",
  });
  await processQueuedDiscoveryJobs(supabase, 3);
  const { data: schedules, error } = await supabase
    .from("discovery_schedules")
    .select("id, sector, query, profile_id, max_auto_contact_lookups, profiles!inner(role, access_status)")
    .eq("enabled", true)
    .not("profile_id", "is", null)
    .eq("profiles.access_status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidateRows = (schedules ?? []) as unknown as ScheduleRow[];
  const profileIds = [...new Set(candidateRows.map((row) => row.profile_id))];
  const { data: paidSubscriptions } = profileIds.length
    ? await supabase
        .from("subscriptions")
        .select("profile_id, status, current_period_end")
        .in("profile_id", profileIds)
        .in("status", ["active", "past_due"])
        .gt("current_period_end", new Date().toISOString())
    : { data: [] };
  const paidProfiles = new Set((paidSubscriptions ?? []).map((subscription) => subscription.profile_id));
  const rows: ScheduleRow[] = [];
  for (const row of candidateRows) {
    const relatedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!canScheduleSearch(relatedProfile?.role ?? "user", paidProfiles.has(row.profile_id))) continue;
    if (!(await isToolEnabled(supabase, "scheduling", row.profile_id))) continue;
    if (!(await isToolEnabled(supabase, "discovery", row.profile_id))) continue;
    rows.push(row);
  }
  if (rows.length === 0) {
    return NextResponse.json({ ran: 0, results: [] });
  }

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        const day = new Date().toISOString().slice(0, 10);
        const result = await runDiscovery(supabase, {
          sector: row.sector,
          query: row.query,
          profileId: row.profile_id,
          maxAutoContactLookups: row.max_auto_contact_lookups,
          operationKey: `schedule:${row.id}:${day}`,
        });
        const summary = `Found ${result.inserted} event(s), ${result.contactsFound} contact(s)`;
        await supabase
          .from("discovery_schedules")
          .update({ last_run_at: new Date().toISOString(), last_run_summary: summary })
          .eq("id", row.id);
        return { scheduleId: row.id, sector: row.sector, query: row.query, ...result };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Scheduled run failed";
        await supabase
          .from("discovery_schedules")
          .update({ last_run_at: new Date().toISOString(), last_run_summary: `Error: ${message}` })
          .eq("id", row.id);
        throw e;
      }
    })
  );

  const summary = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { scheduleId: rows[i].id, sector: rows[i].sector, query: rows[i].query, error: r.reason?.message };
  });

  return NextResponse.json({ ran: rows.length, results: summary });
}
