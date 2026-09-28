import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
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
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }
  const filters = parseFilters(request.nextUrl.searchParams);
  const supabase = context.service;
  let ownedRunEventIds: string[] = [];
  if (filters.runId) {
    const { data: run } = await supabase
      .from("discovery_runs")
      .select("id")
      .eq("id", filters.runId)
      .eq("profile_id", context.profile.id)
      .eq("run_kind", "customer")
      .maybeSingle();
    if (!run) return NextResponse.json({ error: "Discovery run not found" }, { status: 404 });
    const { data: links } = await supabase
      .from("discovery_run_events")
      .select("event_id")
      .eq("discovery_run_id", run.id);
    ownedRunEventIds = (links ?? []).map((link) => link.event_id);
  } else {
    const { data: runs } = await supabase
      .from("discovery_runs")
      .select("id")
      .eq("profile_id", context.profile.id)
      .eq("run_kind", "customer");
    const runIds = (runs ?? []).map((run) => run.id);
    const { data: links } = runIds.length
      ? await supabase
          .from("discovery_run_events")
          .select("event_id")
          .in("discovery_run_id", runIds)
      : { data: [] };
    ownedRunEventIds = [...new Set((links ?? []).map((link) => link.event_id))];
  }
  if (ownedRunEventIds.length === 0) {
    return new NextResponse(`${EVENT_COLUMNS.join(",")}\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  const query = applyEventFilters(
    eventsBaseQuery(supabase).in("id", ownedRunEventIds),
    { ...filters, runId: undefined }
  );
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as EventRecord[];
  const eventIds = rows.map((r) => r.id);

  const contactsByEvent: Record<string, ContactRecord[]> = {};
  if (eventIds.length > 0) {
    const { data: contactLinks, error: linksError } = await supabase
      .from("customer_event_contacts")
      .select("event_id, contact_id")
      .eq("profile_id", context.profile.id)
      .in("event_id", eventIds);
    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
    const contactIds = (contactLinks ?? []).map((link) => link.contact_id);
    const { data: contacts, error: contactsError } = contactIds.length
      ? await supabase.from("contacts").select("*").in("id", contactIds)
      : { data: [], error: null };
    if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 });
    const byId = new Map((contacts ?? []).map((contact) => [contact.id, contact as ContactRecord]));
    for (const link of contactLinks ?? []) {
      const contact = byId.get(link.contact_id);
      if (contact) (contactsByEvent[link.event_id] ??= []).push(contact);
    }
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
