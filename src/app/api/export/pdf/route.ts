import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyEventFilters, eventsBaseQuery, parseFilters } from "@/lib/filters";
import { buildEventScoutPdf, sanitizeFilenamePart } from "@/lib/pdf";
import { attachDocumentsToIris } from "@/lib/iris";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";
import type { ContactRecord, EventRecord } from "@/types/event";

export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RequestBody {
  clientEmail?: string;
  clientName?: string;
  filters?: Record<string, string>;
}

function buildFilterSummary(filters: Record<string, string>): string {
  const labels: Record<string, string> = {
    sector: "Sector",
    tier: "Tier",
    status: "Status",
    from: "From",
    to: "To",
    q: "Search",
  };
  const parts = Object.entries(filters)
    .filter(([key, value]) => Boolean(value) && key in labels)
    .map(([key, value]) => `${labels[key]}: ${value}`);
  return parts.join(" · ") || "Latest search results";
}

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientEmail = body.clientEmail?.trim();
  if (!clientEmail) {
    return NextResponse.json({ error: "clientEmail is required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(clientEmail)) {
    return NextResponse.json({ error: "clientEmail doesn't look like a valid email address" }, { status: 400 });
  }

  const clientName = body.clientName?.trim() || undefined;
  const rawFilters = body.filters ?? {};

  try {
    const supabase = getSupabaseServiceClient();
    const filters = parseFilters(new URLSearchParams(rawFilters));

    const { data: eventRows, error: eventsError } = await applyEventFilters(
      eventsBaseQuery(supabase),
      filters
    );
    if (eventsError) throw new Error(eventsError.message);

    const events = (eventRows ?? []) as EventRecord[];
    const eventIds = events.map((e) => e.id);

    let contactsByEvent: Record<string, ContactRecord[]> = {};
    if (eventIds.length > 0) {
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("*")
        .in("event_id", eventIds);
      if (contactsError) throw new Error(contactsError.message);
      contactsByEvent = (contacts ?? []).reduce<Record<string, ContactRecord[]>>((acc, c) => {
        (acc[c.event_id] ??= []).push(c as ContactRecord);
        return acc;
      }, {});
    }

    const pdfBytes = await buildEventScoutPdf(events, contactsByEvent, {
      clientName,
      filterSummary: buildFilterSummary(rawFilters),
    });
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const namePart = sanitizeFilenamePart(clientName || clientEmail);
    const filename = `EventScout-${namePart}.pdf`;
    const generatedAt = new Date().toISOString();

    const irisResult = await attachDocumentsToIris({
      clientEmail,
      clientName,
      documents: [
        {
          type: "event_scout_pdf",
          filename,
          mimeType: "application/pdf",
          base64: pdfBase64,
          generatedAt,
        },
      ],
    });

    return NextResponse.json({
      attached: irisResult.attached,
      reason: irisResult.reason,
      clientName: irisResult.clientName,
      irisError: irisResult.ok ? undefined : irisResult.error,
      pdfBase64,
      filename,
      eventCount: events.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
