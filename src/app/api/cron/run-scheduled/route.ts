import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { runDiscovery } from "@/lib/discovery";
import { assertVercelCronAuthorized, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 300;

interface ScheduleRow {
  id: string;
  sector: string;
  query: string;
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
  const { data: schedules, error } = await supabase
    .from("discovery_schedules")
    .select("id, sector, query")
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (schedules ?? []) as ScheduleRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ran: 0, results: [] });
  }

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        const result = await runDiscovery(supabase, { sector: row.sector, query: row.query });
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
