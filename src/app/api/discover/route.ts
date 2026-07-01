import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { researchCategory, extractEvents } from "@/lib/agent";
import { enrichAndSaveContacts } from "@/lib/enrichment";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 300;

interface DiscoverBody {
  sector: string;
  query: string;
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

  let body: DiscoverBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sector || !body.query) {
    return NextResponse.json({ error: "sector and query are required" }, { status: 400 });
  }

  try {
    const { findings, citations } = await researchCategory({ sector: body.sector, query: body.query });
    const events = await extractEvents({ findings, sector: body.sector, discoveryQuery: body.query });

    if (events.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, citations, events: [] });
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("events")
      .upsert(events, { onConflict: "event_name,event_start,source_url", ignoreDuplicates: false })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message, events }, { status: 500 });
    }

    const savedEvents = data ?? [];
    const contactResults = await Promise.allSettled(
      savedEvents.map((event) => enrichAndSaveContacts(supabase, event))
    );
    const contactsFound = contactResults.reduce(
      (sum, r) => sum + (r.status === "fulfilled" ? r.value.length : 0),
      0
    );

    return NextResponse.json({
      inserted: savedEvents.length,
      contactsFound,
      citations,
      events: savedEvents,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
