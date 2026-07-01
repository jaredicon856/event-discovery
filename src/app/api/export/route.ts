import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyEventFilters, eventsBaseQuery, parseFilters } from "@/lib/filters";
import type { ContactRecord, EventRecord } from "@/types/event";

const EVENT_COLUMNS: Array<keyof EventRecord> = [
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

const CONTACT_FIELDS: Array<keyof ContactRecord> = ["name", "title", "email", "phone", "linkedin_url"];

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
  const eventIds = rows.map((r) => r.id);

  let contactsByEvent: Record<string, ContactRecord[]> = {};
  if (eventIds.length > 0) {
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("*")
      .in("event_id", eventIds);
    if (contactsError) {
      return NextResponse.json({ error: contactsError.message }, { status: 500 });
    }
    contactsByEvent = (contacts ?? []).reduce<Record<string, ContactRecord[]>>((acc, c) => {
      (acc[c.event_id] ??= []).push(c as ContactRecord);
      return acc;
    }, {});
  }

  const maxContacts = Math.max(0, ...Object.values(contactsByEvent).map((c) => c.length));

  const contactColumns: string[] = [];
  for (let i = 1; i <= maxContacts; i++) {
    for (const field of CONTACT_FIELDS) {
      contactColumns.push(`contact_${i}_${field}`);
    }
  }

  const header = [...EVENT_COLUMNS, ...contactColumns].join(",");

  const body = rows
    .map((row) => {
      const eventValues = EVENT_COLUMNS.map((col) => csvEscape(row[col]));
      const contacts = contactsByEvent[row.id] ?? [];
      const contactValues: string[] = [];
      for (let i = 0; i < maxContacts; i++) {
        const contact = contacts[i];
        for (const field of CONTACT_FIELDS) {
          contactValues.push(csvEscape(contact ? contact[field] : null));
        }
      }
      return [...eventValues, ...contactValues].join(",");
    })
    .join("\n");

  const csv = `${header}\n${body}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="events-export.csv"`,
    },
  });
}
