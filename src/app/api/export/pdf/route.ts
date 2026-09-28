import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { featureDisabledResponse } from "@/lib/featureFlags";
import { applyEventFilters, eventsBaseQuery, parseFilters } from "@/lib/filters";
import { buildEventScoutPdf, sanitizeFilenamePart } from "@/lib/pdf";
import { attachDocumentsToIris } from "@/lib/iris";
import type { ContactRecord, EventRecord } from "@/types/event";

export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RequestBody {
  clientEmail?: string;
  clientName?: string;
  filters?: Record<string, string>;
  /** Opt-in only. PDF export is a standalone download unless this is set. */
  attachToIris?: boolean;
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
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const disabled = await featureDisabledResponse(context.service, "pdf_export", context.profile.id);
  if (disabled) return disabled;

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientEmail = body.clientEmail?.trim();
  const attachToIris = body.attachToIris === true;
  if (attachToIris && (!clientEmail || !EMAIL_RE.test(clientEmail))) {
    return NextResponse.json(
      { error: "A valid clientEmail is required to attach the export to Iris" },
      { status: 400 }
    );
  }

  const clientName = body.clientName?.trim() || undefined;
  const rawFilters = body.filters ?? {};

  try {
    const supabase = context.service;
    const filters = parseFilters(new URLSearchParams(rawFilters));
    let ownedEventIds: string[] = [];
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
      ownedEventIds = (links ?? []).map((link) => link.event_id);
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
      ownedEventIds = [...new Set((links ?? []).map((link) => link.event_id))];
    }
    if (ownedEventIds.length === 0) {
      return NextResponse.json({ error: "Your workspace has no opportunities to export" }, { status: 400 });
    }
    const query = applyEventFilters(
      eventsBaseQuery(supabase).in("id", ownedEventIds),
      { ...filters, runId: undefined }
    );
    const { data: eventRows, error: eventsError } = await query;
    if (eventsError) throw new Error(eventsError.message);

    const events = (eventRows ?? []) as EventRecord[];
    const eventIds = events.map((e) => e.id);

    const contactsByEvent: Record<string, ContactRecord[]> = {};
    if (eventIds.length > 0) {
      const { data: contactLinks, error: linksError } = await supabase
        .from("customer_event_contacts")
        .select("event_id, contact_id")
        .eq("profile_id", context.profile.id)
        .in("event_id", eventIds);
      if (linksError) throw new Error(linksError.message);
      const contactIds = (contactLinks ?? []).map((link) => link.contact_id);
      const { data: contacts, error: contactsError } = contactIds.length
        ? await supabase.from("contacts").select("*").in("id", contactIds)
        : { data: [], error: null };
      if (contactsError) throw new Error(contactsError.message);
      const byId = new Map((contacts ?? []).map((contact) => [contact.id, contact as ContactRecord]));
      for (const link of contactLinks ?? []) {
        const contact = byId.get(link.contact_id);
        if (contact) (contactsByEvent[link.event_id] ??= []).push(contact);
      }
    }

    const pdfBytes = await buildEventScoutPdf(events, contactsByEvent, {
      clientName,
      filterSummary: buildFilterSummary(rawFilters),
    });
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const namePart = sanitizeFilenamePart(
      clientName ||
        clientEmail ||
        context.profile.display_name ||
        context.profile.full_name ||
        "opportunities"
    );
    const filename = `EventScout-${namePart}.pdf`;

    if (!attachToIris || !clientEmail) {
      return NextResponse.json({ pdfBase64, filename, eventCount: events.length });
    }

    const irisResult = await attachDocumentsToIris({
      clientEmail,
      clientName,
      documents: [
        {
          type: "event_scout_pdf",
          filename,
          mimeType: "application/pdf",
          base64: pdfBase64,
          generatedAt: new Date().toISOString(),
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
