import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyEventFilters, eventsBaseQuery, parseFilters } from "@/lib/filters";
import type { EventRecord } from "@/types/event";

const COLUMNS: Array<keyof EventRecord> = [
  "sector",
  "event_name",
  "opportunity_type",
  "event_start",
  "event_end",
  "date_notes",
  "city",
  "state_country",
  "venue_format",
  "status",
  "cfp_deadline",
  "audience_reach",
  "potential_cost",
  "why_it_matters",
  "best_client_fit",
  "booking_path",
  "source_url",
  "visibility_tier",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const supabase = getSupabaseServiceClient();
  const query = applyEventFilters(eventsBaseQuery(supabase), filters);
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as EventRecord[];
  const header = COLUMNS.join(",");
  const body = rows.map((row) => COLUMNS.map((col) => csvEscape(row[col])).join(",")).join("\n");
  const csv = `${header}\n${body}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="events-export.csv"`,
    },
  });
}
