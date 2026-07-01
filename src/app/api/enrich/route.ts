import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { enrichAndSaveContacts } from "@/lib/enrichment";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 240;

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { data: event, error: fetchError } = await supabase
      .from("events")
      .select("id, event_name, source_url, booking_path")
      .eq("id", body.eventId)
      .single();

    if (fetchError || !event) {
      return NextResponse.json({ error: fetchError?.message ?? "Event not found" }, { status: 404 });
    }

    const contacts = await enrichAndSaveContacts(supabase, event);
    return NextResponse.json({ inserted: contacts.length, contacts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
